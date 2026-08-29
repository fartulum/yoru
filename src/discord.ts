import { Client, GatewayIntentBits, Events, EmbedBuilder, Partials, type Message } from "discord.js";
import { Agent } from "./agent";
import { loadEnvFile } from "./llm";
import { startWatchdog } from "./watchdog";
import { logAudit } from "./audit";
import { setPanelState, setPanelClient } from "./panel/api";
import { playRobotBanner } from "./banner";
import {
  parseCommand, findCommand, isModerator, commandCatalogPrompt,
  loadState, saveState, getAccount, effectiveCommands, DEFAULT_ECONOMY,
  type BotState, type CommandContext, type VerifyConfig,
} from "./commands/index";

loadEnvFile();

const agents = new Map<string, Agent>(); // per-channel conversation memory
const state: BotState = loadState();
setPanelState(state);
let saveTimer: NodeJS.Timeout | undefined;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = undefined; saveState(state); }, 2000);
}

function confirmViaReply(msg: Message) {
  return async (question: string): Promise<boolean> => {
    await msg.reply(`${question}(reply "yes" within 60s to confirm)`);
    try {
      const collected = await (msg.channel as any).awaitMessages({
        filter: (m: Message) => m.author.id === msg.author.id && /^(yes)?|(no)?$/i.test(m.content.trim()),
        max: 1,
        time: 60_000,
        errors: ["time"],
      });
      return /^yes?$/i.test(collected.first()!.content.trim());
    } catch {
      return false;
    }
  };
}

export async function startDiscord(ownerIds: string[]) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN missing in .env — get a bot token at discord.com/developers (NEVER your account token).");
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel],
  });
  setPanelClient(client);

  client.once(Events.ClientReady, (c) => {
    console.log(`Discord bot live as ${c.user.tag}. Owner IDs: ${ownerIds.join(", ") || "(none set)"}`);
    setPanelState({ status: "idle", activity: "Discord bot connected" } as any);
    if (ownerIds.length && process.env.WATCHDOG === "on") {
      const ownerAgent = getAgent(`dm:${ownerIds[0]}`, true, `discord:${ownerIds[0]}`);
      startWatchdog(ownerAgent);
    }
  });

  function guildPrefix(guildId: string): string {
    return state.guildConfig[guildId]?.prefix ?? "!";
  }

  function getAgent(key: string, owner: boolean, sender: string): Agent {
    let a = agents.get(key);
    if (!a) {
      a = new Agent({
        owner,
        sender,
        confirm: confirmViaReply as any,
        say: async (t) => {
          const ch = client.channels.cache.get(key.slice(3));
          if ((ch as any)?.isTextBased?.()) await (ch as any).send(t.slice(0, 1900));
        },
        extraSystem: commandCatalogPrompt(guildPrefix(key.slice(3))),
      });
      agents.set(key, a);
    }
    return a;
  }

  /* ----- verification helpers (shared with the web panel) ----- */
  function verifyConfigFor(guildId: string): VerifyConfig {
    return state.verify[guildId] ??= { enabled: false, verified: {} };
  }

  function buildContext(msg: Message, isOwner: boolean, args: string[], prefix: string): CommandContext {
    return {
      msg, isOwner, args, prefix,
      allCommands: () => effectiveCommands(state),
      eco: (id) => getAccount(state, id),
      saveEco: scheduleSave,
      topBalances: () => Object.entries(state.eco)
        .sort((a, b) => b[1].balance - a[1].balance).slice(0, 10)
        .map(([id, acc], i) => `**${i + 1}** <@${id}> — ${acc.balance} :coin:`),
      shopItems: () => SHOP_ITEMS,
      warns: (id) => state.warns[id] ?? [],
      saveWarns: scheduleSave,
      clearWarns: (id) => { delete state.warns[id]; scheduleSave(); },
      level: (id) => {
        const xp = state.levels[id] ?? 0;
        return { level: Math.floor(0.1 * Math.sqrt(xp)) + 1, xp };
      },
      addXp: (id, n) => { state.levels[id] = (state.levels[id] ?? 0) + n; scheduleSave(); },
      topLevels: () => Object.entries(state.levels)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([id, xp], i) => `**${i + 1}** <@${id}> — level ${Math.floor(0.1 * Math.sqrt(xp)) + 1} (${xp} XP)`),
      counter: () => state.counters[msg.guildId ?? "global"] ?? 0,
      setCounter: (n) => { state.counters[msg.guildId ?? "global"] = n; scheduleSave(); },
      setPrefix: (p) => { (state.guildConfig[msg.guildId!] ??= {}).prefix = p; scheduleSave(); },
      setWelcome: (t) => { (state.guildConfig[msg.guildId!] ??= {}).welcome = t; scheduleSave(); },
      setGoodbye: (t) => { (state.guildConfig[msg.guildId!] ??= {}).goodbye = t; scheduleSave(); },
      setAutoRole: (id) => { (state.guildConfig[msg.guildId!] ??= {}).autoRole = id; scheduleSave(); },
      setWarnThreshold: (n) => { (state.guildConfig[msg.guildId!] ??= {}).warnThreshold = n; scheduleSave(); },
      setAfk: (id, reason) => { state.afk[id] = reason; scheduleSave(); },
      afkList: () => Object.entries(state.afk).map(([id, r]) => `<@${id}> — ${r}`),
      addQuote: (q) => { (state.quotes[msg.guildId ?? "global"] ??= []).push(q); scheduleSave(); },
      randomQuote: () => {
        const list = state.quotes[msg.guildId ?? "global"];
        return list?.length ? list[Math.floor(Math.random() * list.length)] : undefined;
      },
      addTodo: (id, t) => { (state.todos[id] ??= []).push(t); scheduleSave(); },
      todos: (id) => state.todos[id] ?? [],
      removeTodo: (id, i) => {
        const list = state.todos[id];
        if (!list || i < 0 || i >= list.length) return false;
        list.splice(i, 1); scheduleSave(); return true;
      },
      snippe: (chId) => state.snippets[chId],
      editSnippe: (chId) => state.editSnippets[chId],
      recordSnippe: (chId, s) => { state.snippets[chId] = s; },
      recordEditSnippe: (chId, s) => { state.editSnippets[chId] = s; },
      // verification
      verifyConfig,
      setVerifyRole: (roleId) => { verifyConfigFor(msg.guildId!).roleId = roleId; scheduleSave(); },
      setVerifyEnabled: (on) => { verifyConfigFor(msg.guildId!).enabled = on; scheduleSave(); },
      setVerifyLog: (chId) => { verifyConfigFor(msg.guildId!).logChannelId = chId; scheduleSave(); },
      markVerified: (userId) => { verifyConfigFor(msg.guildId!).verified[userId] = { username: msg.author.username, at: Date.now() }; scheduleSave(); },
      logVerify: (userId, username) => {
        const cfg = verifyConfigFor(msg.guildId!);
        const ch = cfg.logChannelId ? client.channels.cache.get(cfg.logChannelId) : undefined;
        if ((ch as any)?.isTextBased?.()) {
          (ch as any).send(`✅ <@${userId}> (${username}) verified.`).catch(() => {});
        }
      },
      // command overrides + economy settings (web panel)
      setCommandOverride: (name, o) => { state.commandOverrides[name] = o; scheduleSave(); },
      economySettings: () => state.economy,
      setEconomySettings: (s) => { Object.assign(state.economy, s); scheduleSave(); },
    };
  }

  // snippet tracking
  client.on(Events.MessageDelete, (msg) => {
    if (msg.author?.bot || !msg.content) return;
    state.snippets[msg.channel.id] = { author: msg.author.tag, content: msg.content.slice(0, 500) };
  });
  client.on(Events.MessageUpdate, (_old, msgNew) => {
    if (msgNew.author?.bot || !msgNew.content) return;
    state.editSnippets[msgNew.channel.id] = { author: msgNew.author.tag, content: msgNew.content.slice(0, 500) };
  });

  // welcome / goodbye
  client.on(Events.GuildMemberAdd, async (member) => {
    const cfg = state.guildConfig[member.guild.id];
    if (cfg?.autoRole) {
      const role = member.guild.roles.cache.get(cfg.autoRole);
      if (role) await member.roles.add(role).catch(() => {});
    }
    const sys = member.guild.systemChannel ?? member.guild.publicUpdatesChannel;
    if (sys && cfg?.welcome) {
      await sys.send(cfg.welcome.replace("{user}", `<@${member.id}>`).slice(0, 500)).catch(() => {});
    }
  });
  client.on(Events.GuildMemberRemove, async (member) => {
    const cfg = state.guildConfig[member.guild.id];
    const sys = member.guild.systemChannel;
    if (sys && cfg?.goodbye) {
      await sys.send(cfg.goodbye.replace("{user}", member.user.tag).slice(0, 500)).catch(() => {});
    }
  });

  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;
    const isOwner = ownerIds.includes(msg.author.id);
    const mentioned = msg.mentions.users.has(client.user!.id);
    const isDm = !msg.guild;
    const prefix = guildPrefix(msg.guildId ?? "global");

    // ----- prefix commands: handled WITHOUT the AI agent -----
    const parsed = parseCommand(msg.content, prefix);
    if (parsed) {
      const cmd = effectiveCommands(state).find((c) => c.name === parsed.name) ?? findCommand(parsed.name);
      const ctx = buildContext(msg, isOwner, parsed.args, prefix);
      if (!cmd) {
        await msg.reply({
          embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle("Unknown Command").setDescription(`\`${prefix}${parsed.name}\` doesn't exist. Try \`${prefix}help\`.`).setTimestamp()],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      // real permission enforcement
      if (cmd.perm && msg.member && !msg.member.permissions.has(cmd.perm) && !isOwner) {
        await msg.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Permission Denied").setDescription(`You don't have permission for \`${prefix}${cmd.name}\`.`).setTimestamp()],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (cmd.modOnly && !isModerator(msg, isOwner)) {
        await msg.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Permission Denied").setDescription(`\`${prefix}${cmd.name}\` is for moderators only.`).setTimestamp()],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      logAudit({ time: new Date().toISOString(), actor: `discord:${msg.author.id}`, action: `command:${cmd.name}`, detail: msg.content.slice(0, 200) });
      try {
        await cmd.run(ctx);
        scheduleSave();
      } catch (e) {
        await msg.reply({
          embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Command Error").setDescription(`\`${(e as Error).message}\``).setTimestamp()],
          allowedMentions: { repliedUser: false },
        });
      }
      return; // never forward prefix commands to the LLM
    }

    // ----- AI agent reply (mention or DM), profanely embedded -----
    if (!isDm && !mentioned) return;
    const key = `dm:${msg.channelId}`;
    const agent = getAgent(key, isOwner, `discord:${msg.author.username}${isOwner ? " (OWNER)" : ""}`);
    agent.setConfirm(confirmViaReply(msg) as any);
    logAudit({ time: new Date().toISOString(), actor: `discord:${msg.author.id}`, action: "message", detail: msg.content.slice(0, 200) });
    try {
      const reply = await agent.handle(msg.content.replace(/<!?\d+>/g, "").trim());
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: "yoru", iconURL: client.user!.displayAvatarURL() })
        .setDescription(reply.slice(0, 4000) || "(no reply)")
        .setTimestamp(new Date())
        .setFooter({ text: `requested by ${msg.author.username}` });
      await msg.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (e) {
      await msg.reply(`ERROR: ${(e as Error).message}`).catch(() => {});
    }
  });

  try {
    await client.login(token);
  } catch (e) {
    const err = (e as Error).message ?? String(e);
    console.error("Discord login failed:", err);
    if (/token/i.test(err)) {
      console.error(
        "\nYour DISCORD_TOKEN was rejected. Checklist:\n" +
        "  1. Copy the token from discord.com/developers > your app > Bot > Reset Token (the full string, no quotes/spaces).\n" +
        "  2. In .env write: DISCORD_TOKEN=your_token_here (no quotes around it).\n" +
        "  3. NEVER use your account token or client secret — only the Bot token.\n" +
        "  4. After changing the token, restart the bot."
      );
    } else if (/intents|disallowed/i.test(err)) {
      console.error(
        "\nDiscord rejected the connection because Privileged Intents are off.\nGo to discord.com/developers > your app > Bot and enable:\n" +
        "    - MESSAGE CONTENT INTENT\n" +
        "    - SERVER MEMBERS INTENT (optional but recommended)\nThen restart the bot."
      );
    } else {
      console.error("Check your internet connection, then restart the bot.");
    }
    process.exit(1);
  }
}

export { playRobotBanner };
import { SHOP_ITEMS } from "./commands/index";
