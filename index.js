// index.js – ARK ASE bot 24/7 trên Render (gói Free)

require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

// ============ DISCORD BOT ============ //
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`✅ Bot ARK ASE đã đăng nhập với tên ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;      // bỏ qua bot khác
  if (message.content === "!ping") {
    await message.reply("Pong! 🏓");
  }
});

client.login(process.env.TOKEN);

// ============ KEEP‑ALIVE EXPRESS SERVER (Render Free) ============ //
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;     // Render cấp PORT động

app.get("/", (_, res) => res.send("Bot is running!")); // endpoint test

app.listen(PORT, () => {
  console.log(`🌐 Keep‑alive server chạy cổng ${PORT}`);
});
