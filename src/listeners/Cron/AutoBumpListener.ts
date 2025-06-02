import "reflect-metadata"
import { autoInjectable } from "tsyringe";
import cron from 'node-cron';
import { Listener } from '@sapphire/framework';
import {Client, Message} from "discord.js";
import { ConfigManager } from "../../managers/ConfigManager";

@autoInjectable()
export class AutoBumpListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager: ConfigManager,
    ) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    public override async run(message: Message) {
        /*
        let guild = await this.configManager.getGuild();
        console.log('prova');

        cron.schedule('* * * * *', async () => {
            const channel = await guild.channels.fetch('1304861264790556773');
            if (channel && channel.isTextBased()) {
                await channel.send('/bump');
            }
        });

         */
    }
}