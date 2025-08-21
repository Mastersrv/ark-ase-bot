// index.js – ARK ASE bot
require("dotenv").config();
const express = require("express");
const { 
  Client, GatewayIntentBits, 
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits 
} = require("discord.js");
const { QuickDB } = require("quick.db");
const { 
  joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType,
  entersState, VoiceConnectionStatus, NoSubscriberBehavior, getVoiceConnection
} = require("@discordjs/voice");
const ytdl  = require("ytdl-core");
const ffmpeg = require("ffmpeg-static");
const { spawn } = require("child_process");

const db = new QuickDB();

/* ---------- KEEP-ALIVE ---------- */
const app  = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("✅ Bot is running!"));
app.listen(PORT, () => console.log(`🌐 Keep-alive server on ${PORT}`));

/* ---------- DISCORD BOT ---------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ---------- XP ⇄ ROLE ---------- */
const levelRoles = {
  1:   "1393347597359382723",
  10:  "1393347839152750734",
  100: "1393347907972890754",
  999: "1393347979427057706",
};
const calcLevel = xp => Math.floor(0.1 * Math.sqrt(xp));

/* ---------- Audio player ---------- */
const player = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
});

/* ---------- Slash Commands Register ---------- */
async function registerCommands() {
  const commands = [ 
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Xem danh sách lệnh"),

    new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("Xem thông tin của 1 thành viên")
      .addUserOption(opt =>
        opt.setName("target").setDescription("Chọn thành viên").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("rank")
      .setDescription("Xem cấp độ và XP của bạn hoặc người khác")
      .addUserOption(opt =>
        opt.setName("target").setDescription("Chọn thành viên").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("top")
      .setDescription("Xem top 5 nhiều XP nhất"),

    new SlashCommandBuilder()
      .setName("play")
      .setDescription("Phát nhạc từ YouTube")
      .addStringOption(opt =>
        opt.setName("url").setDescription("Link YouTube").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("Dừng nhạc"),
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    console.log("🔄 Đang đăng ký slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        "1168873250701443213"
      ),
      { body: commands },
    );
    console.log("✅ Slash commands đã đăng ký thành công!");
  } catch (error) {
    console.error("❌ Lỗi đăng ký:", error);
  }
}

registerCommands();

/* ---------- Interaction Handler ---------- */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "help") {
    await interaction.reply("📜 Các lệnh: `/help`, `/userinfo`, `/rank`, `/top`, `/play`, `/stop`");
  }

  if (interaction.commandName === "userinfo") {
    const user = interaction.options.getUser("target") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);
    await interaction.reply({
      embeds: [{
        title: `Thông tin của ${user.username}`,
        fields: [
          { name: "ID", value: user.id, inline: true },
          { name: "Ngày tham gia server", value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline: true },
          { name: "Ngày tạo tài khoản", value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline: true },
        ],
        thumbnail: { url: user.displayAvatarURL({ size: 1024 }) },
        color: 0x00AE86
      }]
    });
  }

  if (interaction.commandName === "rank") {
    const target = interaction.options.getUser("target") || interaction.user;
    const xp = (await db.get(`xp_${interaction.guildId}_${target.id}`)) || 0;
    const level = calcLevel(xp);
    await interaction.reply(`🎖️ ${target.username} đang ở cấp **${level}** với **${xp} 🍀**`);
  }

  if (interaction.commandName === "top") {
    const all = await db.all();
    const top = all
      .filter(d => d.id.startsWith(`xp_${interaction.guildId}_`))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const list = await Promise.all(
      top.map(async (d, i) => {
        const uid = d.id.split("_")[2];
        let name;
        try {
          const m = await interaction.guild.members.fetch(uid);
          name = m.displayName || m.user.tag;
        } catch { name = `User ${uid}`; }
        return `**#${i + 1}** ${name} – ${d.value} 🍀`;
      })
    );
    await interaction.reply(`🏆 **Top 5 nhiều XP nhất**\n${list.join("\n")}`);
  }
 
  if (interaction.commandName === "play") {
    const url = interaction.options.getString("url");
    if (!ytdl.validateURL(url)) return interaction.reply("❌ URL YouTube không hợp lệ!");
    const vc = interaction.member.voice.channel;
    if (!vc) return interaction.reply("⚠️ Bạn phải vào kênh thoại trước!");

    const conn = joinVoiceChannel({
      channelId: vc.id,
      guildId:   vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator,
    });
    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      return interaction.reply("🚫 Không thể kết nối voice!");
    }

    const yt = ytdl(url, { quality: "highestaudio", highWaterMark: 1 << 25 });
    const ff = spawn(ffmpeg, [
      "-i", "pipe:0",
      "-analyzeduration", "0",
      "-loglevel", "0",
      "-f", "opus",
      "-ar", "48000",
      "-ac", "2",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "ignore"] });

    yt.pipe(ff.stdin);
    const resource = createAudioResource(ff.stdout, { inputType: StreamType.Opus });
    player.play(resource);
    conn.subscribe(player);

    return interaction.reply(`🎶 Đang phát nhạc: ${url}`);
  }

  if (interaction.commandName === "stop") {
    const conn = getVoiceConnection(interaction.guild.id);
    if (!conn) return interaction.reply("Bot không ở kênh thoại.");
    conn.destroy();
    return interaction.reply("⏹️ Đã dừng nhạc.");
  }
});

/* ---------- XP khi chat bình thường ---------- */
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!")) {
    const key = `xp_${msg.guildId}_${msg.author.id}`;
    let xp = await db.get(key) || 0;
    xp += 10; await db.set(key, xp);

    const old = calcLevel(xp - 10), lvl = calcLevel(xp);
    if (lvl > old) {
      msg.channel.send(`🎉 <@${msg.author.id}> đã lên cấp **${lvl}**!`);
      const target = Object.keys(levelRoles).map(Number).sort((a, b) => b - a)
                       .filter(l => lvl >= l).pop();
      if (target) {
        const member = await msg.guild.members.fetch(msg.author.id);
        for (const id of Object.values(levelRoles))
          if (id !== levelRoles[target] && member.roles.cache.has(id))
            await member.roles.remove(id).catch(() => {});
        if (!member.roles.cache.has(levelRoles[target]))
          await member.roles.add(levelRoles[target]).catch(() => {});
      }
    }
  }
});

client.login(process.env.TOKEN);
