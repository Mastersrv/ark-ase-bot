// deploy-commands.js
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Kiểm tra độ trễ của bot'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 Đang đăng ký slash commands...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // Global command
      { body: commands },
    );
    console.log("✅ Slash commands đã đăng ký thành công!");
  } catch (error) {
    console.error("❌ Lỗi đăng ký:", error);
  }
})();

