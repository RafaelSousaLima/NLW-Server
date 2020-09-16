import { Request, Response } from 'express';

import db from '../database/connection';
import convertHourToMinutes from '../utils/convertHourToMinutes';

interface scheduleItem {
    week_day: number;
    from: string;
    to: string;
}

export default class ClassesControllers {

    async index(request: Request, response: Response) {
        const filters = request.query;
        if (!filters.subject || !filters.week_day || !filters.time) {
            return response.json(
                await db('classes')
                .join('users', 'classes.user_id', '=', 'users.id')
                .select(['classes.*', 'users.*'])
                );
        } 

        // if (filters.subject && (!filters.week_day || !filters.time)) {
        //     return response.json(
        //         await db()
        //             .select().from('classes')
        //             .where('classes.subject', '=', filters.subject as string)
        //     );
        // }
        //  else if (filters.week_day && (!filters.subject || !filters.time)) {
        //     return response.json(
        //         await db('classes')
        //             .join('class_schedule', 'classes.id', '=', 'class_schedule.class_id')
        //             .where('class_schedule.', '=', Number(filters.week_day))
        //             .select('classes.*')
        //     );
        // } else {

        const timeAndMinutes = convertHourToMinutes(filters.time as string);

        const classes = await db('classes')
            .whereExists(function () {
                this.select('class_schedule.*')
                    .from('class_schedule')
                    .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
                    .whereRaw('`class_schedule`.`week_day` = ??', [Number(filters.week_day)])
                    .whereRaw('`class_schedule`.`from` <= ??', [timeAndMinutes])
                    .whereRaw('`class_schedule`.`to` > ??', [timeAndMinutes])
            })
            .where('classes.subject', '=', filters.subject as string)
            .join('users', 'classes.user_id', '=', 'users.id')
            .select(['classes.*', 'users.*']);

        return response.json(classes);
        // }

    }

    async create(request: Request, response: Response) {
        const data = request.body;

        const trx = await db.transaction();

        try {
            const insertedUsersIds = await trx('users').insert({
                name: data.name,
                avatar: data.avatar,
                whatsapp: data.whatsapp,
                bio: data.bio
            });

            const user_id = insertedUsersIds[0];

            const insertedClassesId = await trx('classes').insert({
                subject: data.subject,
                cost: data.cost,
                user_id: user_id
            });

            const classesId = insertedClassesId[0];

            const classSchedule = data.schedule.map((scheduleItem: scheduleItem) => {
                return {
                    class_id: classesId,
                    week_day: scheduleItem.week_day,
                    from: convertHourToMinutes(scheduleItem.from),
                    to: convertHourToMinutes(scheduleItem.to)
                };
            });

            await trx('class_schedule').insert(classSchedule)

            await trx.commit();

            return response.status(201).send();

        } catch (err) {
            await trx.rollback();
            return response.status(400).json({
                error: 'Unexpected error while creating new class'
            });
        }
    }
}