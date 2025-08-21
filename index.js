// index.js – ARK ASE bot 24/7 (Render Free)
require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const { QuickDB } = require("quick.db");
const { joinVoiceChannel,
        createAudioPlayer,
        createAudioResource,
        StreamType,
        entersState,
        VoiceConnectionStatus,
        NoSubscriberBehavior,
        getVoiceConnection } = require("@discordjs/voice");
const ytdl  = require("ytdl-core");
const ffmpeg = require("ffmpeg-static");      

const db = new QuickDB();

/* ---------- KEEP‑ALIVE ---------- */
const app  = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("✅ Bot is running!"));
app.listen(PORT, () => console.log(`🌐 Keep‑alive server on ${PORT}`));

/* ---------- DISCORD BOT ---------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
});
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Kiểm tra độ trễ của bot")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    console.log("🔄 Đang đăng ký slash commands...");
    await rest.put(
  Routes.applicationGuildCommands(
    process.env.CLIENT_ID,
    process.env.GUILD_ID
  ),
  { body: commands },
);

    console.log("✅ Slash commands đã đăng ký thành công!");
  } catch (error) {
    console.error("❌ Lỗi đăng ký:", error);
  }
}

registerCommands();


client.once("ready", () =>
  console.log(`✅ Logged in as ${client.user.tag}`)
);

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

/* ========== ONE listener ========== */
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;
  const content = msg.content.trim();

  /* ===== LỆNH CƠ BẢN ===== */
  if (content === "!aya")  return msg.reply("Aya đây, mời bạn lói 🌹");
  if (content === "!bot")  return msg.reply("Bot version thiếu kinh phí 🤖 – gõ `!lenh` để xem.");
  if (content === "!lenh") return msg.reply("`!ping` `!rank` `!top` `!play <url>` `!stop`"); 
  if (content === "!ping") return msg.reply("Pong!!! 🏓");

  /* ===== !rank ===== */
  if (content === "!rank") {
    const xp = (await db.get(`xp_${msg.guildId}_${msg.author.id}`)) || 0;
    const level = calcLevel(xp);
    return msg.reply(`Anh bạn đang ở đẳng cấp **${level}** với **${xp} 🍀**.`);
  }

  /* ===== !top ===== */
  if (content === "!top") {
    const all = await db.all();
    const top = all
      .filter(d => d.id.startsWith(`xp_${msg.guildId}_`))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const list = await Promise.all(
      top.map(async (d, i) => {
        const uid = d.id.split("_")[2];
        let name;
        try {
          const m = await msg.guild.members.fetch(uid);
          name = m.displayName || m.user.tag;
        } catch { name = `User ${uid}`; }
        return `**#${i + 1}** ${name} – ${d.value} 🍀`;
      })
    );
    return msg.channel.send(`🏆 **Top 5 người chơi nhiều chuyện nhất**\n${list.join("\n")}`);
  }

  /* ===== PHÁT NHẠC (đã cập nhật) ===== */          // ⟵ PHẦN ĐÃ THAY THẾ
  if (content.startsWith("!play ")) {
    const url = content.split(" ")[1];
    if (!ytdl.validateURL(url)) return msg.reply("❌ URL YouTube không hợp lệ!");

    const vc = msg.member.voice.channel;
    if (!vc) return msg.reply("⚠️ Bạn phải vào kênh thoại trước!");

    // Kết nối voice
    const conn = joinVoiceChannel({
      channelId: vc.id,
      guildId:   vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator,
    });
    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      return msg.reply("🚫 Không thể kết nối voice!");
    }

    // Tải stream YouTube
    const yt = ytdl(url, { quality: "highestaudio", highWaterMark: 1 << 25 });

    // Demux WebM → Opus bằng ffmpeg-static
    const ff = require("child_process").spawn(ffmpeg, [
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

    return msg.reply("🎶 Đang phát nhạc!");
  }

  /* ===== !stop ===== */
  if (content === "!stop") {
    const conn = getVoiceConnection(msg.guild.id);
    if (!conn) return msg.reply("Bot không ở kênh thoại.");
    conn.destroy();
    return msg.reply("⏹️ Đã dừng nhạc.");
  }

  /* ===== XP khi chat bình thường ===== */
  if (!content.startsWith("!")) {
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

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("🏓 Pong!!! (Slash command)");
  }
});


/* ---------- END listener ---------- */

client.login(process.env.TOKEN);
