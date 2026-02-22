import { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, 
    PermissionsBitField, Events 
} from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import axios from 'axios';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const DATA_FILE = './data.json';
const DEFAULT_UNLIMITED = ['1462133470112256217', '1461121431017619542', '1470081356389421178'];
const UNLIMITED_ROLES = (process.env.UNLIMITED_ROLES || '').replace(/\s/g, '').split(',').filter(id => id.length > 0);
if (UNLIMITED_ROLES.length === 0) UNLIMITED_ROLES.push(...DEFAULT_UNLIMITED);
const BOOSTER_ROLE = (process.env.BOOSTER_ROLE || '').replace(/\s/g, '');

let db = { users: {}, config: {} };
if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

const saveDB = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

async function sendLog(guild, title, description, color = '#5865F2') {
    const logChannelId = db.config?.logChannel;
    if (!logChannelId) return;
    const channel = guild.channels.cache.get(logChannelId);
    if (!channel) return;
    const embed = new EmbedBuilder().setTitle(`📝 LOG: ${title}`).setDescription(description).setColor(color).setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
}

const iconUploadState = new Map();

client.once(Events.ClientReady, (c) => {
    console.log(`✅ Bot online como ${c.user.tag}`);
    
    // Verificação periódica de Boosters (Opção 3)
    setInterval(async () => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return;
        
        for (const [userId, data] of Object.entries(db.users)) {
            const member = await guild.members.fetch(userId).catch(() => null);
            const isAdm = UNLIMITED_ROLES.some(r => member?.roles.cache.has(r));
            const isBoost = member?.roles.cache.has(BOOSTER_ROLE);

            if (member && !isAdm && !isBoost) {
                const role = guild.roles.cache.get(data.roleId);
                if (role) await role.delete().catch(() => {});
                delete db.users[userId];
                saveDB();
                await sendLog(guild, 'Benefício Expirado', `O usuário <@${userId}> perdeu o Boost e seu cargo personalizado foi removido.`, '#FF0000');
            }
        }
    }, 1000 * 60 * 30); // A cada 30 minutos
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'meucargo') {
            const userRoleData = db.users[interaction.user.id];
            if (!userRoleData) return interaction.reply({ content: '❌ Você não possui um cargo personalizado!', ephemeral: true });
            const role = interaction.guild.roles.cache.get(userRoleData.roleId);
            const sharedList = userRoleData.shared.map(id => `<@${id}>`).join(', ') || 'Ninguém';
            const embed = new EmbedBuilder().setTitle('📊 MEU CARGO').addFields({ name: '🏷️ Nome', value: role ? role.name : 'Erro', inline: true }, { name: '👥 Compartilhado com', value: sharedList }).setColor(role ? role.color : '#5865F2');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (['painelboost', 'paineladm'].includes(commandName)) {
            const isAdm = commandName === 'paineladm';
            const embed = new EmbedBuilder()
                .setTitle('💎 SISTEMA PREMIUM DE CARGOS')
                .setDescription(`✨ **Status:** ${isAdm ? '👑 Administrador' : '🚀 Booster'}\n🎨 **Tabela de Cores:** [Clique Aqui](https://tabeladecores.dev.br)\n🛠️ Gerencie seu cargo abaixo.`)
                .setColor('#5865F2').setThumbnail(interaction.guild.iconURL());

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('create_role').setLabel('Criar Cargo').setEmoji('➕').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('edit_color').setLabel('Cor / Gradiente').setEmoji('🎨').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('edit_icon').setLabel('Ícone').setEmoji('🖼️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('delete_role').setLabel('Apagar Cargo').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('share_role').setLabel('Compartilhar').setEmoji('🤝').setStyle(ButtonStyle.Secondary)
            );

            const components = [row, row2];
            if (isAdm) {
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_logs').setLabel('Configurar Logs').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
                ));
            }

            return interaction.reply({ embeds: [embed], components, ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const userRoleData = db.users[userId];

        if (interaction.customId === 'set_logs') {
            const modal = new ModalBuilder().setCustomId('modal_set_logs').setTitle('Configurar Logs');
            const input = new TextInputBuilder().setCustomId('log_channel_id').setLabel('ID do Canal').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'create_role') {
            const member = await interaction.guild.members.fetch(userId).catch(() => interaction.member);
            const isAdm = UNLIMITED_ROLES.some(r => member.roles.cache.has(r.trim()));
            const isBoost = member.roles.cache.has(BOOSTER_ROLE?.trim());

            if (!isAdm && !isBoost) return interaction.reply({ content: '❌ Benefício exclusivo para **Boosters** ou **Administradores**!', ephemeral: true });
            if (userRoleData && !isAdm) return interaction.reply({ content: '❌ Você já possui um cargo!', ephemeral: true });

            const modal = new ModalBuilder().setCustomId('modal_create_role').setTitle('Criar Cargo');
            const nameInput = new TextInputBuilder().setCustomId('role_name').setLabel('Nome do Cargo').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'edit_color') {
            if (!userRoleData) return interaction.reply({ content: '❌ Crie um cargo primeiro!', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_edit_color').setTitle('Cores');
            const hexInput = new TextInputBuilder().setCustomId('hex_color').setLabel('HEX (#ffffff)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(hexInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'edit_icon') {
            if (!userRoleData) return interaction.reply({ content: '❌ Crie um cargo primeiro!', ephemeral: true });
            iconUploadState.set(userId, { roleId: userRoleData.roleId, timestamp: Date.now() });
            return interaction.reply({ content: '📸 Envie a imagem no chat agora.', ephemeral: true });
        }

        if (interaction.customId === 'delete_role') {
            if (!userRoleData) return interaction.reply({ content: '❌ Você não possui um cargo!', ephemeral: true });
            const role = interaction.guild.roles.cache.get(userRoleData.roleId);
            if (role) await role.delete().catch(() => {});
            delete db.users[userId];
            saveDB();
            await sendLog(interaction.guild, 'Cargo Deletado', `O usuário <@${userId}> deletou seu cargo personalizado.`, '#FF0000');
            return interaction.reply({ content: '✅ Cargo excluído.', ephemeral: true });
        }

        if (interaction.customId === 'share_role') {
            if (!userRoleData) return interaction.reply({ content: '❌ Crie um cargo primeiro!', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('modal_share_role').setTitle('Compartilhar');
            const targetInput = new TextInputBuilder().setCustomId('target_id').setLabel('ID do Usuário').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
            return interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        const userId = interaction.user.id;

        if (interaction.customId === 'modal_set_logs') {
            const channelId = interaction.fields.getTextInputValue('log_channel_id');
            db.config.logChannel = channelId;
            saveDB();
            return interaction.reply({ content: `✅ Logs configurados em <#${channelId}>`, ephemeral: true });
        }

        if (interaction.customId === 'modal_create_role') {
            const name = interaction.fields.getTextInputValue('role_name');
            await interaction.deferReply({ ephemeral: true });
            try {
                const role = await interaction.guild.roles.create({ name, position: interaction.guild.members.me.roles.highest.position - 1 });
                await interaction.member.roles.add(role);
                db.users[userId] = { roleId: role.id, shared: [] };
                saveDB();
                await sendLog(interaction.guild, 'Cargo Criado', `O usuário <@${userId}> criou o cargo **${name}**.`, '#00FF00');
                return interaction.editReply({ content: `✅ Cargo **${name}** criado!` });
            } catch (e) { return interaction.editReply({ content: '❌ Erro ao criar cargo.' }); }
        }

        if (interaction.customId === 'modal_edit_color') {
            let hex = interaction.fields.getTextInputValue('hex_color');
            if (!hex.startsWith('#')) hex = `#${hex}`;
            const userRoleData = db.users[userId];
            const role = interaction.guild.roles.cache.get(userRoleData.roleId);
            if (role) {
                await role.setColor(hex);
                await sendLog(interaction.guild, 'Cor Alterada', `O usuário <@${userId}> alterou a cor do cargo para **${hex}**.`);
                return interaction.reply({ content: `✅ Cor ${hex} aplicada!`, ephemeral: true });
            }
        }

        if (interaction.customId === 'modal_share_role') {
            const targetId = interaction.fields.getTextInputValue('target_id');
            const userRoleData = db.users[userId];
            const member = await interaction.guild.members.fetch(userId);
            const isAdm = UNLIMITED_ROLES.some(r => member.roles.cache.has(r));
            if (!isAdm && userRoleData.shared.length >= 10) return interaction.reply({ content: '❌ Limite de 10 atingido!', ephemeral: true });
            try {
                const targetMember = await interaction.guild.members.fetch(targetId);
                const role = interaction.guild.roles.cache.get(userRoleData.roleId);
                await targetMember.roles.add(role);
                if (!userRoleData.shared.includes(targetId)) { userRoleData.shared.push(targetId); saveDB(); }
                await sendLog(interaction.guild, 'Cargo Compartilhado', `O usuário <@${userId}> compartilhou seu cargo com <@${targetId}>.`);
                return interaction.reply({ content: `✅ Compartilhado com <@${targetId}>!`, ephemeral: true });
            } catch (e) { return interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true }); }
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const state = iconUploadState.get(message.author.id);
    if (state && (Date.now() - state.timestamp) < 60000) {
        const attachment = message.attachments.first();
        if (!attachment || !attachment.contentType?.startsWith('image/')) return;
        try {
            const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
            const role = message.guild.roles.cache.get(state.roleId);
            if (role) {
                await role.setIcon(Buffer.from(response.data));
                iconUploadState.delete(message.author.id);
                await message.delete().catch(() => {});
                await sendLog(message.guild, 'Ícone Alterado', `O usuário <@${message.author.id}> alterou o ícone do cargo.`);
                return message.channel.send({ content: `✅ <@${message.author.id}>, ícone atualizado!` }).then(m => setTimeout(() => m.delete(), 5000));
            }
        } catch (e) {}
    }
});

client.login(process.env.TOKEN);
