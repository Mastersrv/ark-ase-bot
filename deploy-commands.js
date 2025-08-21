// deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Kiểm tra độ trễ của bot'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🔄 Đang đăng ký slash command...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // CLIENT_ID là ID ứng dụng bot
      { body: commands },
    );
    console.log('✅ Slash command đã đăng ký!');
  } catch (error) {
    console.error(error);
  }
})();
