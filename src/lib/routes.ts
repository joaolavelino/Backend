import { prisma } from "./prisma";
import dayjs from "dayjs";
import { FastifyInstance } from "fastify";
import { z } from "zod";

//essa função exporta as rotas para o server.ts - ela deve ser assincrona
export async function appRoutes(app: FastifyInstance) {
  //CRIAR HÁBITO
  app.post("/habits", async (req) => {
    //cria uma schema do objeto que será o req.body
    const createHabitBody = z.object({
      title: z.string(),
      weekDays: z.array(z.number().min(0).max(6)),
    });
    // chamar o dayJs, zerar as horas, e transformar em uma datetime
    const today = dayjs().startOf("day").toDate();
    // envolver o req.body com esse schema e o TS vai reconhecer o tipo de cada info
    const { title, weekDays } = createHabitBody.parse(req.body);
    const newHabit = prisma.habit.create({
      data: {
        title,
        created_at: today,
        weekDays: {
          create: weekDays.map((weekDay) => {
            return {
              week_day: weekDay,
            };
          }),
        },
      },
    });
    return newHabit;
  });

  //GET TODOS OS HABITOS
  app.get("/habits", async (req) => {
    const allHabits = await prisma.habit.findMany();
    return allHabits;
  });

  //INFOS DO DIA ESPECIFICO
  app.get("/day", async (req) => {
    //schema da request - coerce transforma a string recebida (sempre vem em string) para o tipo date
    const getDaySchema = z.object({
      date: z.coerce.date(),
    });
    //obter o dia em que será feita a busca - envolvendo no schema
    const { date } = getDaySchema.parse(req.query);
    const parsedDay = dayjs(date).startOf("day");
    //'day'retorna o dia da semana - 'date' retorna o dia do mes
    const searchedWeekDay = parsedDay.get("day");

    //buscar todos os habitos possíveis
    // - habitos criados antes da data
    // - tenha os pelo menos um week day que coincida com o dia da semana local
    const possibleHabits = await prisma.habit.findMany({
      where: {
        created_at: {
          lte: date,
        },
        weekDays: {
          some: {
            week_day: searchedWeekDay,
          },
        },
      },
    });

    //todos os habitos já completados
    // procurar o dia no banco de dados (pois quando o ato de completar uma tarefa cria um objeto day)
    const day = await prisma.day.findUnique({
      where: {
        date: parsedDay.toDate(),
      },
      include: {
        dayHabits: true,
      },
    });

    const completedHabits = day?.dayHabits.map((dayHabit) => {
      return dayHabit.habit_id;
    });

    return {
      weekday: searchedWeekDay,
      asignedhabits: possibleHabits,
      completedHabits,
    };
  });

  //TOGGLE - TAREFA COMPLETA
  app.patch("/habits/:id/toggle", async (req) => {
    //schema
    const toggleHabitSchema = z.object({
      id: z.string().uuid(),
    });

    const { id } = toggleHabitSchema.parse(req.params);

    const today = dayjs().startOf("day").toDate();

    let day = await prisma.day.findUnique({
      where: {
        date: today,
      },
    });

    if (!day) {
      day = await prisma.day.create({
        data: {
          date: today,
        },
      });
    }
    //checar se o habito já está completo - se há um registro na tabela dayHabit com esse dia e esse habito
    const dayHabit = await prisma.dayHabit.findUnique({
      where: {
        day_id_habit_id: {
          day_id: day.id,
          habit_id: id,
        },
      },
    });
    //se houver um dayhabit desse dia com esse habito, já está completa a tarefa

    //se nao houver um registro, eu crio, se houver, eu apago
    if (!dayHabit) {
      await prisma.dayHabit.create({
        data: {
          day_id: day.id,
          habit_id: id,
        },
      });
      return `Habit ${id} is set to 'completed' on day ${day.date.getDate()}`;
    } else {
      await prisma.dayHabit.delete({
        where: {
          id: dayHabit.id,
        },
      });
      return `Habit ${id} is set to 'uncompleted' on day ${day.date.getDate()}`;
    }
  });

  //GET - RESUMO DE DIAS
  app.get("/summary", async (req) => {
    //chamada mais complexa => SQL na mão, raw.
    //ao contrario das outras chamadas, se mudarmos o banco de dados de SQLITE para outro tipo, essa parte deve ser reescrita

    const summary = await prisma.$queryRaw`
      SELECT 
        D.id , 
        D.date ,
        -- Sub-query para pegar os habitos completos por dia
        (
          SELECT
            cast(count(*) as float) --formato original é BigInt - o prisma nao lida nativamente - 'cast( ... as float)' converte o conteúdo para float
          FROM day_habits DH
          WHERE DH.day_id = D.id
        ) as completed,
        -- Sub-query para habitos disponiveis no dia
        (
          SELECT
            cast(count(*) as float)
          FROM habit_week_day HWD
          -- JOIN: buscar os habitos relacionados à tabela Habit_week_day
          JOIN habits H
            ON H.id = HWD.habit_id
          WHERE
            HWD.week_day = cast(strftime('%W', D.date/1000, 'unixepoch') as int)
            AND H.created_at <= D.date
            -- formato de data no SQLite é EPOCH & Unix timestamp - milisegundos contados desde 1/1/1970 às 0:00
            -- strftime - função do SQLite para formatar a data num formato específico:
            -- doc: sqlite.org/lang_datefunc.html
            -- args: ( formato de saída (doc), data de origem, formato de entrada)
            -- converter para Int usando cast, para poder comparar com o dia da semana que é 0 a 6
            
        ) as amount
      FROM days D

    `;

    return summary;
  });
}
