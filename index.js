// index.js – ARK ASE bot
require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Partials,
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle
} = require("discord.js");
const { QuickDB } = require("quick.db");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  entersState,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
} = require("@discordjs/voice");
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require("ffmpeg-static");
const { spawn } = require("child_process");

const db = new QuickDB();

/* ---------- KEEP-ALIVE ---------- */
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("✅ Bot is running!"));
app.listen(PORT, () => console.log(`🌐 Keep-alive server on ${PORT}`));

/* ---------- DISCORD BOT ---------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ---------- XP ⇄ ROLE ---------- */
const levelRoles = {
  1: "1393347597359382723",
  10: "1393347839152750734",
  100: "1393347907972890754",
  999: "1393347979427057706",
};
const calcLevel = (xp) => Math.floor(0.1 * Math.sqrt(xp));

/* ---------- Audio player ---------- */
const player = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
});

/* ---------- Slash Commands Register ---------- */
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("check_mutations")
      .setDescription("Kiểm tra kết quả tính toán mutation với giới hạn 32-bit")
      .addIntegerOption((opt) =>
        opt
          .setName("matrimutation")
          .setDescription("Nhập giá trị MatriMutation")
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("patrimutation")
          .setDescription("Nhập giá trị PatriMutation")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Xem danh sách lệnh"),

    new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("Xem thông tin của 1 thành viên")
      .addUserOption((opt) =>
        opt
          .setName("target")
          .setDescription("Chọn thành viên")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("rank")
      .setDescription("Xem cấp độ và XP của bạn hoặc người khác")
      .addUserOption((opt) =>
        opt
          .setName("target")
          .setDescription("Chọn thành viên")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("top")
      .setDescription("Xem top 5 nhiều XP nhất"),

    new SlashCommandBuilder()
      .setName("play")
      .setDescription("Phát nhạc từ YouTube")
      .addStringOption((opt) =>
        opt.setName("url").setDescription("Link YouTube").setRequired(true)
      ),

    new SlashCommandBuilder().setName("stop").setDescription("Dừng nhạc"),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    console.log("🔄 Đang đăng ký slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        "1168873250701443213"
      ),
      { body: commands }
    );
    console.log("✅ Slash commands đã đăng ký thành công!");
  } catch (error) {
    console.error("❌ Lỗi đăng ký:", error);
  }
}

registerCommands();

/* ---------- Interaction Handler ---------- */
client.on("interactionCreate", async (interaction) => {
  // 👉 Xử lý Button trước
  if (interaction.isButton()) {
    if (interaction.customId === "pause") {
      player.pause();
      return interaction.reply({ content: "⏸️ Đã tạm dừng", ephemeral: true });
    }

    if (interaction.customId === "resume") {
      player.unpause();
      return interaction.reply({ content: "▶️ Tiếp tục phát", ephemeral: true });
    }

    if (interaction.customId === "skip") {
      player.stop();
      return interaction.reply({ content: "⏭️ Đã skip", ephemeral: true });
    }

    if (interaction.customId === "queue") {
      return interaction.reply({ content: "📃 Queue hiện chưa được cài đặt", ephemeral: true });
    }
  }

  // 👉 Chỉ xử lý Slash Command nếu là Chat Input
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "help") {
    await interaction.reply(
      "📜 Các lệnh: `/help`, `/userinfo`, `/rank`, `/top`, `/play`, `/stop`"
    );
  }

  if (interaction.commandName === "userinfo") {
    const user = interaction.options.getUser("target") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);
    await interaction.reply({
      embeds: [
        {
          title: `Thông tin của ${user.username}`,
          fields: [
            { name: "ID", value: user.id, inline: true },
            {
              name: "Ngày tham gia server",
              value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
              inline: true,
            },
            {
              name: "Ngày tạo tài khoản",
              value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
              inline: true,
            },
          ],
          thumbnail: { url: user.displayAvatarURL({ size: 1024 }) },
          color: 0x00ae86,
        },
      ],
    });
  }

  if (interaction.commandName === "rank") {
    const target = interaction.options.getUser("target") || interaction.user;
    const xp = (await db.get(`xp_${interaction.guildId}_${target.id}`)) || 0;
    const level = calcLevel(xp);
    await interaction.reply(
      `🎖️ ${target.username} đang ở cấp **${level}** với **${xp} 🍀**`
    );
  }

  if (interaction.commandName === "top") {
    const all = await db.all();
    const top = all
      .filter((d) => d.id.startsWith(`xp_${interaction.guildId}_`))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const list = await Promise.all(
      top.map(async (d, i) => {
        const uid = d.id.split("_")[2];
        let name;
        try {
          const m = await interaction.guild.members.fetch(uid);
          name = m.displayName || m.user.tag;
        } catch {
          name = `User ${uid}`;
        }
        return `**#${i + 1}** ${name} – ${d.value} 🍀`;
      })
    );
    await interaction.reply(`🏆 **Top 5 nhiều XP nhất**\n${list.join("\n")}`);
  }

  if (interaction.commandName === "play") {
    const url = interaction.options.getString("url");
    const channel = interaction.member.voice.channel;
    if (!channel) return interaction.reply("❌ Bạn phải vào kênh thoại trước!");

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    try {
      const stream = ytdl(url, {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25,
      });
      const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });

      player.play(resource);
      connection.subscribe(player);

      await entersState(connection, VoiceConnectionStatus.Ready, 20e3);

      const info = await ytdl.getInfo(url);
      const embed = {
        color: 0x1db954,
        title: `🎵 Đang phát`,
        description: `[${info.videoDetails.title}](${url})`,
        thumbnail: { url: info.videoDetails.thumbnails[0].url },
        fields: [
          { name: "Kênh", value: info.videoDetails.author.name, inline: true },
          { name: "Thời lượng", value: `${Math.floor(info.videoDetails.lengthSeconds / 60)} phút`, inline: true }
        ],
        footer: { text: `Yêu cầu bởi ${interaction.user.username}`, icon_url: interaction.user.displayAvatarURL() },
        timestamp: new Date(),
      };

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("pause")
            .setLabel("⏸️ Pause")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("resume")
            .setLabel("▶️ Resume")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("skip")
            .setLabel("⏭️ Skip")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("queue")
            .setLabel("📃 Queue")
            .setStyle(ButtonStyle.Secondary),
        );

      await interaction.reply({ embeds: [embed], components: [row] });

    } catch (err) {
      console.error(err);
      await interaction.reply("❌ Không thể phát nhạc từ link này.");
    }
  }

  if (interaction.commandName === "stop") {
    const conn = getVoiceConnection(interaction.guild.id);
    if (!conn) return interaction.reply("Bot không ở kênh thoại.");
    conn.destroy();
    return interaction.reply("⏹️ Đã dừng nhạc.");
  }

  if (interaction.commandName === "check_mutations") {
    const matri = interaction.options.getInteger("matrimutation");
    const patri = interaction.options.getInteger("patrimutation");

    const INT32_MAX = 2147483647;
    const INT32_MIN = -2147483648;

    let sum = matri + patri;
    let result;

    if (sum > INT32_MAX) {
        result = INT32_MIN - (sum - INT32_MAX + 1);
    } else if (sum < INT32_MIN) {
        result = INT32_MAX + 1 + (sum - INT32_MIN);
    } else {
        result = sum;
    } 
    // 👉 Xác định Mut Dương hay Mut Âm
    const mutType = result >= 0 ? "☀️ Mut Dương" : "🌑 Mut Âm";

    // 👉 Hàm tính tỷ lệ mutation trong ARK
    function calcMutationRate(matri, patri) {
        if (matri < 0) matri = 0;
        if (patri < 0) patri = 0;

        const rolls = 3;
        const chancePerRoll = 0.025;

        let effectiveRate;

        if (matri >= 20 && patri >= 20) {
            effectiveRate = 0; // cả 2 full
        } else if (matri >= 20 || patri >= 20) {
            effectiveRate = (1 - Math.pow(1 - chancePerRoll, rolls)) / 2;
        } else {
            effectiveRate = 1 - Math.pow(1 - chancePerRoll, rolls);
        }

        return (effectiveRate * 100).toFixed(2); // %
    }
    const mutationRate = calcMutationRate(matri, patri); 
    // 👉 Embed trả về
    return interaction.reply({
        embeds: [{
            title: "🧬 Kết quả Check Mutations",
            color: result >= 0 ? 0x2ecc71 : 0xe74c3c, // xanh nếu dương, đỏ nếu âm
            fields: [
                { name: "MatriMutation", value: `\`${matri}\``, inline: true },
                { name: "PatriMutation", value: `\`${patri}\``, inline: true },
                // { name: "Tổng", value: `\`${sum}\``, inline: true },
                { name: "Kết quả", value: `**${result}**`, inline: true },
                { name: "Loại Mutation", value: mutType, inline: true },
                { name: "Tỷ lệ Mutation", value: `${mutationRate}%`, inline: true },
            ],
            footer: { text: `Giới hạn int32: từ ${INT32_MIN} đến ${INT32_MAX}` },
            timestamp: new Date(),
        }],
    });
} 
});

/* ---------- XP khi chat bình thường ---------- */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith("!")) {
    const key = `xp_${msg.guildId}_${msg.author.id}`;
    let xp = (await db.get(key)) || 0;
    xp += 10;
    await db.set(key, xp);

    const old = calcLevel(xp - 10),
      lvl = calcLevel(xp);
    if (lvl > old) {
      msg.channel.send(`🎉 <@${msg.author.id}> đã lên cấp **${lvl}**!`);
      const target = Object.keys(levelRoles)
        .map(Number)
        .sort((a, b) => b - a)
        .filter((l) => lvl >= l)
        .pop();
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
/* ---------- Auto role cho thành viên mới ---------- */
client.on("guildMemberAdd", async (member) => {
  try {
    console.log(`👋 Thành viên mới: ${member.user.tag} (ID: ${member.id})`);

    const roleId = "1415665328943530025"; // ID role Server Tag
    const role = member.guild.roles.cache.get(roleId);

    if (!role) {
      console.error("❌ Không tìm thấy role Server Tag!");
      return;
    }

    await member.roles.add(role);
    console.log(`✅ Đã gán role ${role.name} cho ${member.user.tag}`);
  } catch (err) {
    console.error("❌ Lỗi khi gán role:", err);
  }
}); 
/* ---------- Reaction Role ---------- */
const reactionRoles = {
  "1415421191073562654": "1397120911215296583", // <:Aquatica:1415411111111111> -> role Aquatica
  "🧬": "1392079828957528074",               // emoji mặc định 🧬 -> role Breeding
};

const reactionMessageId = "1211334614623461426"; // ID message có reaction

client.on("messageReactionAdd", async (reaction, user) => {
  if (reaction.partial) await reaction.fetch(); // 👈 cần nếu dùng partials
  if (reaction.message.id !== reactionMessageId) return;
  if (user.bot) return;

  const key = reaction.emoji.id || reaction.emoji.name;
  console.log("➡️ Emoji click:", key); // 👈 debug
  const roleId = reactionRoles[key];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  await member.roles.add(roleId).catch(console.error);
  console.log(`✅ Đã gán role ${roleId} cho ${user.tag}`);
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.id !== reactionMessageId) return;
  if (user.bot) return;

  const key = reaction.emoji.id || reaction.emoji.name;
  console.log("➡️ Emoji remove:", key);
  const roleId = reactionRoles[key];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  await member.roles.remove(roleId).catch(console.error);
  console.log(`❌ Đã gỡ role ${roleId} khỏi ${user.tag}`);
});

/* ---------- Auto Role Breeding ---------- */
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const roleBreedBasic = "1392079828957528074"; // breed basic
  const roleBreeding = "1415707578029047970";   // breeding

  try {
    // Khi thành viên mới nhận được role breed basic
    if (
      !oldMember.roles.cache.has(roleBreedBasic) && 
      newMember.roles.cache.has(roleBreedBasic)
    ) {
      // Nếu chưa có role breeding thì thêm vào
      if (!newMember.roles.cache.has(roleBreeding)) {
        await newMember.roles.add(roleBreeding);
        console.log(`✅ Đã thêm role Breeding cho ${newMember.user.tag}`);
      }
    }
  } catch (err) {
    console.error("❌ Lỗi khi auto thêm role breeding:", err);
  }
});

client.login(process.env.TOKEN);
