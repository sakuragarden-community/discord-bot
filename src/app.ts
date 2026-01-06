import 'reflect-metadata';
import {SapphireClient} from '@sapphire/framework';
import {GatewayIntentBits, Partials} from 'discord.js';
import dotenv from 'dotenv';
import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';


const client = new SapphireClient({
    intents: [
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildScheduledEvents,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ],
    loadMessageCommandListeners: true
});

dotenv.config();

client.login(process.env.TOKEN);

if (process.env.MODE === 'staging') {
    client.login(process.env.TOKEN_STAGING);
} else {

}
