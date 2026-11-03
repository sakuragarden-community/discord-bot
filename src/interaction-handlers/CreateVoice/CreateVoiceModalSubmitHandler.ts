import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ChannelType, MessageFlags, ModalSubmitInteraction, OverwriteType, PermissionFlagsBits } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import {
    buildVoiceRoomName,
    CREATE_VOICE_LIMIT_INPUT_ID,
    CREATE_VOICE_MODAL_ID,
    CREATE_VOICE_TYPE_INPUT_ID,
    deleteVoiceRoomIfEmpty,
    emptyVoiceRoomError,
    fetchVoicesCategoryId,
    findEmptyVoiceRooms,
    VOICE_EMPTY_TIMEOUT_MS,
    VOICE_MAX_USERS,
    VOICE_MIN_USERS,
    VOICE_TYPES,
} from '../../utils/CreateVoice';

/** Crea la stanza vocale dell'utente nella categoria delle vocali, con il tipo e il limite scelti nella modale. */
@autoInjectable()
export class CreateVoiceModalSubmitHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected settingsManager?: SettingsManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
        });
    }

    public override parse(interaction: ModalSubmitInteraction) {
        return interaction.customId === CREATE_VOICE_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!interaction.inCachedGuild()) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const [typeValue] = interaction.fields.getStringSelectValues(CREATE_VOICE_TYPE_INPUT_ID);
            const [limitValue] = interaction.fields.getStringSelectValues(CREATE_VOICE_LIMIT_INPUT_ID);

            const type = VOICE_TYPES.find(({ value }) => value === typeValue);
            if (!type) {
                throw new Error(`tipo di stanza "${typeValue}" non valido`);
            }

            const userLimit = Number(limitValue);
            if (!Number.isInteger(userLimit) || userLimit < VOICE_MIN_USERS || userLimit > VOICE_MAX_USERS) {
                throw new Error(`numero massimo di persone "${limitValue}" non valido`);
            }

            const guild = interaction.guild;
            const member = interaction.member;
            const categoryId = await fetchVoicesCategoryId(this.settingsManager!);

            // Verifica ripetuta all'invio: la modale potrebbe essere stata aperta più volte prima di confermare
            const [emptyRoom] = findEmptyVoiceRooms(guild, categoryId, member.id);
            if (emptyRoom) {
                await interaction.editReply(emptyVoiceRoomError(emptyRoom));
                return;
            }

            // Passando degli overwrite la stanza non eredita quelli della categoria, che vanno quindi copiati.
            // L'overwrite intestato al creatore serve a riconoscerne la stanza (vedi findEmptyVoiceRooms).
            const category = guild.channels.cache.get(categoryId);
            const categoryOverwrites = category && 'permissionOverwrites' in category
                ? [...category.permissionOverwrites.cache.values()]
                : [];
            const ownOverwrite = categoryOverwrites.find((overwrite) => overwrite.id === member.id);

            const room = await guild.channels.create({
                name: buildVoiceRoomName(type, member.displayName),
                type: ChannelType.GuildVoice,
                parent: categoryId,
                userLimit,
                permissionOverwrites: [
                    ...categoryOverwrites.filter((overwrite) => overwrite.id !== member.id),
                    {
                        id: member.id,
                        type: OverwriteType.Member,
                        allow: (ownOverwrite?.allow.bitfield ?? BigInt(0)) | PermissionFlagsBits.Connect,
                        deny: (ownOverwrite?.deny.bitfield ?? BigInt(0)) & ~PermissionFlagsBits.Connect,
                    },
                ],
                reason: `Stanza vocale creata da ${interaction.user.username}`,
            });

            // Chi è già in vocale viene spostato nella stanza; altrimenti la stanza viene eliminata se resta vuota
            if (member.voice.channelId) {
                await member.voice.setChannel(room);
            }
            setTimeout(() => {
                deleteVoiceRoomIfEmpty(room).catch((error) =>
                    console.error('[CreateVoiceModalSubmitHandler] Errore durante l\'eliminazione della stanza vuota:', error),
                );
            }, VOICE_EMPTY_TIMEOUT_MS);

            await interaction.editReply(`✅ La tua stanza vocale è pronta: ${room}`);
        } catch (error) {
            console.error('[CreateVoiceModalSubmitHandler] Errore durante la creazione della stanza vocale:', error);
            await interaction.editReply('❌ Non è stato possibile creare la stanza vocale, riprova più tardi.');
        }
    }
}
