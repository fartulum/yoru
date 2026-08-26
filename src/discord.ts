import { Client, GatewayIntentBits, Events, type Message } from "discord.js";
import { Agent } from "./agent.js";
import { loadEnvFile } from "./llm.js";
import { startWatchdog } from "./watchdog.js";

loadEnvFile();

const agents = new Map<string, Agent>(); // per-channel conversation memory

function confirmViaReply(msg: Message) {
  return async (question: string): Promise<boolean> => {
    await msg.reply(`${question}\n(reply "yes" within 60s to confirm)`);
    try {
      const collected = await (msg.channel as any).awaitMessages({
        filter: (m: Message) => m.author.id === msg.author.id && /^(y(es)?|no?)$/i.test(m.content.trim()),
        max: 1,
        time: 60_000,
        errors: ["time"],
      });
      return /^y(es)?$/i.test(collected.first()!.content.trim());
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
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`Discord bot live as ${c.user.tag}. Owner IDs: ${ownerIds.join(", ") || "(none set!)"}`);
    // autonomous watchdog alerts go to the owner's DM channel
    if (ownerIds.length && process.env.WATCHDOG === "on") {
      const ownerAgent = getAgent(`dm:${ownerIds[0]}`, true, `discord:${ownerIds[0]}`);
      startWatchdog(ownerAgent);
    }
  });

  function getAgent(key: string, owner: boolean, sender: string): Agent {
    let a = agents.get(key);
    if (!a) {
      a = new Agent({
        owner,
        sender,
        say: async (t) => {
          const ch = client.channels.cache.get(key.slice(3));
          if (ch?.isTextBased()) await (ch as any).send(t.slice(0, 1900));
        },
      });
      agents.set(key, a);
    }
    return a;
  }

  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;
    const isOwner = ownerIds.includes(msg.author.id);
    const mentioned = msg.mentions.users.has(client.user!.id);
    const isDm = !msg.guild;
    if (!isDm && !mentioned) return;
    const key = `dm:${msg.channelId}`;
    const agent = getAgent(key, isOwner, `discord:${msg.author.username}${isOwner ? " (OWNER)" : ""}`);
    agent.setConfirm(confirmViaReply(msg));
    try {
      const reply = await agent.handle(msg.content.replace(/<@!?\d+>/g, "").trim());
      await msg.reply(reply.slice(0, 1900));
    } catch (e) {
      await msg.reply(`ERROR: ${(e as Error).message}`).catch(() => {});
    }
  });

  await client.login(token);
}
