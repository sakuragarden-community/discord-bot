import {Command, Listener} from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {autoInjectable} from "tsyringe";
import {ConfigManager} from "../managers/ConfigManager";

@autoInjectable()
export class LobbyCommand extends Command {

    public constructor(
        context: Command.Context,
        options: Command.Options,
        protected configManager: ConfigManager,
    ) {
        super(context, {...options});
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand(
            new SlashCommandBuilder()
                .setName('lobby')
                .setDescription('Trasforma una stanza in un canale vocale privato - aka "lobby".')
                .addIntegerOption(option =>
                    option
                        .setName('partecipanti')
                        .setDescription('Specifica il numero massimo di persone che possono entrare nella lobby.')
                        .setRequired(true)
                ),
            { }
        );
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const participants = interaction.options.getInteger('partecipanti', true);
        let guild = await this.configManager.getGuild();
        let member = await guild.members.fetch(interaction.user.id);
        let voiceChannel = member.voice.channel;
        console.log(voiceChannel);
        if (voiceChannel && voiceChannel.name.includes('Stanza')) {
            await voiceChannel.setUserLimit(participants);
            await interaction.reply(`Hai creato una lobby con ${participants} partecipanti. La stanza tornerà pubblica quando tutti lasceranno la stanza.`);
        }

    }
}