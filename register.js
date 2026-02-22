import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
    new SlashCommandBuilder()
        .setName('meucargo')
        .setDescription('Veja informações sobre o seu cargo personalizado'),
    new SlashCommandBuilder()
        .setName('painelboost')
        .setDescription('Abre o painel de cargo personalizado para Boosters'),
    new SlashCommandBuilder()
        .setName('paineladm')
        .setDescription('Abre o painel de cargo personalizado para Administradores'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('🔄 Iniciando o registro dos comandos slash...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('✅ Comandos slash registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
})();
