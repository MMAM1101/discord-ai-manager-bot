/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * كود بوت ديسكورد الذكي المتكامل - برمجة ذاتية بالذكاء الاصطناعي (Discord.js v14)
 * هذا الملف معد للنشر المباشر على منصات التشغيل التلقائي مثل Railway أو Render أو Heroku.
 * يتم استخدام مكتبة @google/genai للتكامل مع موديل Gemini-3.5-Flash لتحليل طلبات الإدارة وبرمجتها ذاتياً فوراً.
 */

import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  PermissionsBitField, 
  ChannelType, 
  ActivityType, 
  Message 
} from 'discord.js';
import { GoogleGenAI, Type } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// قراءة المتغيرات البيئية الحساسة
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error("❌ خطأ: لم يتم العثور على توكن البوت Discord Bot Token! يرجى تعيين متغيّر البيئة DISCORD_BOT_TOKEN");
  process.exit(1);
}

// تهيئة عميل ديسكورد مع الصلاحيات (Intents) الكاملة والمطلوبة
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// تهيئة محرك الذكاء الاصطناعي Gemini إذا تم توفير المفتاح
let ai: GoogleGenAI | null = null;
if (GEMINI_KEY) {
  ai = new GoogleGenAI({
    apiKey: GEMINI_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      }
    }
  });
  console.log("✅ تم تهيئة محرك الذكاء الاصطناعي Gemini بنجاح لخدمة البرمجة الذاتية للبوت!");
} else {
  console.warn("⚠️ تنبيه: لم يتم توفير GEMINI_API_KEY. لن تتمكن من برمجة الأوامر تلقائياً باستخدام غرف ديسكورد؛ سيتم تشغيل الأوامر المخزنة مسبقاً فقط.");
}

// مسار حفظ الأوامر المبرمجة ذاتياً بشكل دائم بملف قواعد محلي
const RULES_FILE_PATH = path.join(process.cwd(), 'discord_bot_rules.json');

// واجهة تعريف القواعد الديناميكية
interface CustomRule {
  id: string;
  name: string;
  trigger: string;
  matchType: 'exact' | 'flexible';
  actionType: 'reply_text' | 'reply_image' | 'sequential_replies' | 'create_role' | 'create_channel' | 'poll' | 'custom_code';
  explanation: string;
  actionData: any;
  createdBy: string;
  createdAt: string;
  mockJsCode?: string;
}

// مصفوفة الاحتفاظ بالعدادات للرد التتابعي (مثل كتابة 3) مفتاحها هو: "guildId-userId-ruleId"
const sequentialCounters = new Map<string, number>();

// تحميل القواعد المخزنة
let activeRules: CustomRule[] = [];

// مسار حفظ الإعدادات العامة للبوت مثل روم الذكاء الاصطناعي المحدد
const CONFIG_FILE_PATH = path.join(process.cwd(), 'discord_bot_config.json');
let botConfig = {
  aiChannelId: ""
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      botConfig = JSON.parse(data);
      console.log(`⚙️ تم تحميل الإعدادات العامة بنجاح. روم الذكاء الاصطناعي النشط: ${botConfig.aiChannelId || 'غير معيّن بعد'}`);
    }
  } catch (error) {
    console.error("❌ خطأ أثناء تحميل ملف الإعدادات العامة:", error);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(botConfig, null, 2), 'utf8');
    console.log("💾 تم حفظ إعدادات البوت العامة بالملف المحلي.");
  } catch (error) {
    console.error("❌ فشل حفظ إعدادات البوت العامة:", error);
  }
}

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE_PATH)) {
      const data = fs.readFileSync(RULES_FILE_PATH, 'utf8');
      activeRules = JSON.parse(data);
      console.log(`📦 تم تحميل ${activeRules.length} قاعدة مبرمجّة ذاتياً من قاعدة البيانات المحلية.`);
    } else {
      // قواعد افتراضية تم برمجتها سابقاً للتوضيح والبدء السريع
      activeRules = [
        {
          id: "rule-default-1",
          name: "إرسال صور تتابعية عند كتابة 3",
          trigger: "3",
          matchType: "exact",
          actionType: "sequential_replies",
          explanation: "عند كتابة رقم '3' متتالياً، يقوم يرسل صور فنية رائعة ومختلفة في كل مرة.",
          createdAt: new Date().toISOString(),
          createdBy: "الإدارة العامة",
          actionData: {
            replies: [
              { type: "image", content: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe" },
              { type: "image", content: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5" },
              { type: "image", content: "https://images.unsplash.com/photo-1618005198143-e5283464303b" }
            ]
          }
        }
      ];
      saveRules();
    }
  } catch (error) {
    console.error("❌ خطأ أثناء تحميل ملف القواعد:", error);
  }
}

function saveRules() {
  try {
    fs.writeFileSync(RULES_FILE_PATH, JSON.stringify(activeRules, null, 2), 'utf8');
    console.log("💾 تم حفظ قائمة الأوامر المبرمجة بنجاح بالملف المحلي.");
  } catch (error) {
    console.error("❌ فشل حفظ قائمة الأوامر المبرمجة ديناميكياً:", error);
  }
}

// عند تشغيل البوت وجهوزية اتصاله بديسكورد
client.once('ready', () => {
  console.log(`
=============================================
🤖 تم تشغيل ومزامنة البوت الذكي بنجاح!
👑 اسم البوت: ${client.user?.tag}
🆔 معرف البوت: ${client.user?.id}
🌐 متصل حالياً بـ ${client.guilds.cache.size} خادم ديسكورد.
=============================================
  `);
  
  // وضع حالة تفاعلية ومميزة للبوت
  client.user?.setActivity({
    name: 'أوامر المشرفين | اكتب !برمج لإضافة أمر بالذكاء الاصطناعي',
    type: ActivityType.Listening
  });

  loadRules();
  loadConfig();
});

// الاستماع للرسائل والتعامل مع الأوامر الذكية والتلقائية
client.on('messageCreate', async (message: Message) => {
  // تجاهل رسائل البوتات لتجنب حلقات التكرار اللانهائية
  if (message.author.bot) return;

  const content = message.content.trim();

  // 1- آلية تعيين وإدارة روم الذكاء الاصطناعي المباشر
  const isAiChannelConfigTrigger = (text: string): boolean => {
    const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
    
    // الاختصارات والأوامر المباشرة
    const exactShortcuts = [
      "!set-ai-channel",
      "!روم-الذكاء",
      "!تعيين-روم-الذكاء",
      "!روم الذكاء",
      "!روم للذكاء"
    ];
    if (exactShortcuts.some(s => norm.includes(s) || norm === s)) return true;

    // التحقق من تراكيب الجمل الشائعة باللغة العربية
    const hasRoom = norm.includes("روم") || norm.includes("قناة") || norm.includes("الغرفة") || norm.includes("القناة");
    const hasAi = norm.includes("ذكاء") || norm.includes("الاصطناعي") || norm.includes("ai") || norm.includes("جيميني") || norm.includes("gemini");
    const hasSettingWord = norm.includes("هذا") || norm.includes("هاذا") || norm.includes("تعيين") || norm.includes("تفعيل") || norm.includes("تخصيص") || norm.includes("هادي") || norm.includes("هذه");

    // الكلمات الدلالية المدمجة
    if (hasRoom && hasAi && (hasSettingWord || norm.includes("للذكاء"))) {
      return true;
    }

    // مطابقة التعبيرات القصيرة الشائعة جداً
    const commonPhrases = [
      "روم الذكاء",
      "روم للذكاء",
      "قناة الذكاء",
      "هاذا الروم للذكاء",
      "هذا الروم للذكاء",
      "روم الذكاء الاصطناعي",
      "هاذا الروم للذكاء الاصطناعي",
      "هذا الروم للذكاء الاصطناعي",
      "روم الai",
      "روم ال ai"
    ];
    if (commonPhrases.some(p => norm.includes(p) || norm === p)) return true;

    return false;
  };

  if (isAiChannelConfigTrigger(content)) {
    // التحقق من صلاحيات العضو المرسِل (مدير أو لديه إدارة الخادم)
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator) && 
        !message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('❌ عذراً، هذا الأمر خاص بمشرفي الخادم لتعيين روم الذكاء الاصطناعي المحدد!');
    }

    botConfig.aiChannelId = message.channelId;
    saveConfig();

    const channelEmbed = new EmbedBuilder()
      .setColor('#ab47bc')
      .setTitle('🧠 تم تفعيل روم الذكاء الاصطناعي المباشر (Gemini Core)!')
      .setDescription(`مرحباً بك! بقصد تسهيل الإشراف وتفاعل المجتمع، تم تعيين هذه القناة (<#${message.channelId}>) كقناة ذكاء اصطناعي مخصصة ومستقلة.`)
      .addFields(
        { name: '💬 كيف يعمل الروم؟', value: 'الآن، أي رسالة أو سؤال يكتبه أي عضو هنا في هذه القناة سيقوم البوت بالإجابة عليه وتفسيره فوراً باستخدام ذكاء **Gemini 3.5 Flash** دون الحاجة لكتابة أوامر أو بادئات.' },
        { name: '🔄 لإلغاء التفعيل أو التغيير', value: 'يمكنك كتابة هذا الأمر مجدداً في أي قناة أخرى لنقل صلاحية الاستماع المباشر إليها.' }
      )
      .setFooter({ text: '⚡ مدعوم كلياً بمحرك البحث والفهم الفوري لـ Google Gemini' });

    return message.reply({ embeds: [channelEmbed] });
  }

  // 2- توجيه المحادثات الجارية تلقائياً من روم الذكاء الاصطناعي المعتمد
  if (botConfig.aiChannelId && message.channelId === botConfig.aiChannelId) {
    if (!ai) {
      return message.reply('❌ عذراً، محرك الذكاء الاصطناعي Gemini غير مفعّل على هذا البوت لعدم توفير مفتاح API بيئي (GEMINI_API_KEY).');
    }

    // إظهار علامة أن البوت يكتب (Typing Indicator) لإعطاء تجربة ديسكورد تفاعلية ورائعة
    await (message.channel as any).sendTyping();

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: content,
        config: {
          systemInstruction: "أنت مساعد ذكاء اصطناعي خبير وودود، ومساعد للمشرفين والأعضاء في خادم ديسكورد. أجب باختصار ووضوح وجاذبية باللغة العربية مع مراعاة التنسيق الجميل والظريف المناسب لديسكورد وتأثيرات الخطوط والسطور المتباعدة.",
        }
      });

      const replyText = response.text || "لم يتمكن الذكاء الاصطناعي من توليد الإجابة المطلوبة حالياً.";
      
      // ديسكورد يقبل حتى 2000 حرف كحد أقصى للرسالة الواحدة
      if (replyText.length > 2000) {
        const chunks = replyText.match(/[\s\S]{1,1900}/g) || [replyText];
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(replyText);
      }
    } catch (gemIniErr: any) {
      console.error("AI Room Response Error:", gemIniErr);
      await message.reply(`❌ عذراً، حدث خطأ أثناء تشغيل وتوليف الذكاء الاصطناعي لتلبية طلبك: ${gemIniErr.message}`);
    }
    return; // إنهاء التنفيذ لكي لا تتضارب مع بقية قوانين المشرف المبرمجة مسبقاً
  }

  // 3- آلية البرمجة الذاتية للبوت بالذكاء الاصطناعي (أمر: !برمج أو !برمجة)
  if (content.startsWith('!برمج') || content.startsWith('!برمجة') || content.startsWith('يا بوت برمج')) {
    // التحقق من صلاحيات العضو المرسِل لتجنب عبث الأعضاء العاديين
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator) && 
        !message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('❌ عذراً، هذا الأمر خاص بمشرفي الخادم ومدراء الإدارة المعتمدين فقط!');
    }

    // استخراج الطلب والتعليمات
    let userPrompt = "";
    if (content.startsWith('!برمج ')) userPrompt = content.replace('!برمج ', '');
    else if (content.startsWith('!برمجة ')) userPrompt = content.replace('!برمجة ', '');
    else if (content.startsWith('يا بوت برمج ')) userPrompt = content.replace('يا بوت برمج ', '');

    if (!userPrompt) {
      const infoEmbed = new EmbedBuilder()
        .setColor('#3d5afe')
        .setTitle('🤖 دليل البرمجة الذاتية الفورية بالذكاء الاصطناعي ⚡')
        .setDescription('يمكنك برمجة البوت ذاتياً وبكود فوري في ثانية واحدة فقط وعبر لغة عربية عامية بمجرد كتابة الطلب! إليك أمثلة:')
        .addFields(
          { name: '📥 مثال 1: الأوامر التتابعية الذكية (طلبك بالكامل)', value: '`!برمج إذا كتبت رقم 3 ارسل الصورة ذي [أرفق صورتك] وإذا كتبت 3 مرة ثانية ارسل كذا وهلم جرا...`' },
          { name: '🛡️ مثال 2: إدارة الرتب التلقائية', value: '`!برمج سوي رتبة جديدة بلون أصفر واسمها VIP وعطها صلاحيات إدارة القنوات والكتابة`' },
          { name: '🗳️ مثال 3: تصويتات واستقصاءات ذكية', value: '`!برمج روم مخصص للتصويت على الألعاب يرسل عنوان تصويت بريدأكشن موافق ممتنع معارض`' },
          { name: '🎤 مثال 4: الأقسام الصوتية وتجهيز القنوات', value: '`!برمج سوي لي روم صوتي وتكست مخصص مبرتب ترحاب ترحيب وبلوك للأعضاء`' }
        )
        .setFooter({ text: 'صُنع بكل حب ليكون رفيق المشرفين المبرمج المتكامل! ✨' });
      return message.reply({ embeds: [infoEmbed] });
    }

    if (!ai) {
      return message.reply('❌ ميزة البرمجة الذاتية بالذكاء الاصطناعي متوقفة لعدم توفير مفتاح الـ API لـ Gemini. يرجى تزويد البوت بالمفتاح في المتغيرات البيئية لاستخدامها.');
    }

    const compilingMsg = await message.reply('⚡ جاري تحليل تعليماتك وبرمجة رد البوت وتنصيب المكونات ذاتياً بالذكاء الاصطناعي... يرجى الانتظار 🤖⏳');

    try {
      const systemInstruction = `أنت خبير فني محترف في ديسكورد ومهندس برمجيات ذكاء اصطناعي.
مهمتك هي قراءة طلب المشرف ديسكورد باللغة العربية وتحويله إلى كائن برمجي (Object هيكلية JSON) يمثل قاعدة ديسكورد تفاعلية صالحة بنسبة 100%.

يجب عليك فرز المخرجات إلى أحد التصنيفات البرمجية (actionType):
- "reply_text": رد نصي.
- "reply_image": إرسال صورة محددة.
- "sequential_replies": ردود وصور تتابعية مختلفة عند تكرار نفس الكلمة (كما لو قال: إذا كتبت 3 أرسل كذا، المرة الثانية أرسل كذا، المرة الثالثة أرسل كذا).
- "create_role": إنشاء رتبة ديسكورد مع اسم ولون وصلاحيات.
- "create_channel": إنشاء قناة مكتوبة أو صوتية بمواصفات وصلاحيات.
- "poll": رسالة تصويت تعبيرية.
- "custom_code": أي نظام إدارة مخصص ومهام إدارية.

أرجع كائن JSON موافق تماماً للنموذج التالي ليتم حفظه بملفات البوت وتفعيله فوراً بلا توقف:
{
  "name": "اسم مميز للأمر باللغة العربية",
  "trigger": "الكلمة المفتاحية أو جملة الفحص المسببة للرد برمجياً (مثال: '3' أو 'vip' أو 'تصويت')",
  "matchType": "exact" (مطابقة حرفية متطابقة تماماً) أو "flexible" (مطابقة جملة مرنة تحتوي على الكلمة)،
  "actionType": "reply_text" | "reply_image" | "sequential_replies" | "create_role" | "create_channel" | "poll" | "custom_code",
  "explanation": "شرح كامل وودي للمشرف باللغة العربية عما قام به البوت من برمجة وتفعيله فوراً.",
  "actionData": {
     // عمر الكائنات حسب الـ actionType المناسب:
     // - لـ "reply_text": { "text": "نص الرد التلقائي" }
     // - لـ "reply_image": { "imageUrl": "رابط الصورة" }
     // - لـ "sequential_replies": { "replies": [ { "type": "image"|"text", "content": "الرابط أو النص التتابعي 2", "description": "الوصف للمرحلة" }, ... ] }
     // - لـ "create_role": { "roleName": "اسم رول", "color": "رمز لون هيكس HEX", "permissions": ["قائمة صلاحيات Administrators أو MANAGE_ROLES الخ"] }
     // - لـ "create_channel": { "channelName": "اسم روم", "type": "text"|"voice" }
     // - لـ "poll": { "title": "استفتاء الإدارة", "options": ["خيار أ", "خيار ب"] }
  }
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `الطلب البرمجي من المشرف للغة البوت الفورية: "${userPrompt}"`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["name", "trigger", "matchType", "actionType", "explanation", "actionData"],
            properties: {
              name: { type: Type.STRING },
              trigger: { type: Type.STRING },
              matchType: { type: Type.STRING },
              actionType: { type: Type.STRING },
              explanation: { type: Type.STRING },
              actionData: { type: Type.OBJECT }
            }
          }
        }
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("لم يستطع الموديل الاستجابة بالصيغة المقررة.");

      const parsedRule = JSON.parse(jsonText);
      
      const newRule: CustomRule = {
        id: `rule-${Date.now()}`,
        name: parsedRule.name,
        trigger: parsedRule.trigger,
        matchType: parsedRule.matchType || 'exact',
        actionType: parsedRule.actionType,
        explanation: parsedRule.explanation,
        actionData: parsedRule.actionData,
        createdBy: message.author.tag,
        createdAt: new Date().toISOString()
      };

      // حفظ في القائمة الدائمة
      activeRules.push(newRule);
      saveRules();

      const successEmbed = new EmbedBuilder()
        .setColor('#2e7d32')
        .setTitle('✅ تم البرمجة والتركيب الذاتي بنجاح!')
        .setDescription(`مرحباً **${message.author.username}**، قام محرك الذكاء الاصطناعي ببناء الكود ونشره في عمليات البوت الحية حالياً وهو مستعد للخدمة الفورية!`)
        .addFields(
          { name: '⚙️ اسم الأمر/الحدث الجديد', value: `\`${newRule.name}\``, inline: true },
          { name: '🎯 الكلمة المفعلة (Trigger)', value: `\`${newRule.trigger}\``, inline: true },
          { name: '🛠️ نوع العملية البرمجية', value: `\`${newRule.actionType}\``, inline: true },
          { name: '📝 التوضيح الفني وبنية العمل', value: `${newRule.explanation}` }
        )
        .setFooter({ text: 'البوت مبرمج ذاتياً وقابل لإدخال المزيد من الأوامر الحية في أي وقت.' });

      await compilingMsg.delete();
      return message.reply({ embeds: [successEmbed] });

    } catch (err: any) {
      console.error(err);
      await compilingMsg.edit(`❌ فشل في برمجة طلبك تلقائياً لخلل برمجي أو عدم تطابق الصيغة. \nتفاصيل: ${err.message}`);
    }
  }

  // 2- فحص الرسائل الواردة لمطابقتها مع الأوامر المبرمجة ذاتياً النشطة
  for (const rule of activeRules) {
    let isMatched = false;
    
    if (rule.matchType === 'exact') {
      isMatched = (content.toLowerCase() === rule.trigger.toLowerCase());
    } else {
      isMatched = content.toLowerCase().includes(rule.trigger.toLowerCase());
    }

    if (isMatched) {
      try {
        console.log(`🎯 تنفيذ الأمر المبرمج ذاتياً: ${rule.name} (نوع العمل: ${rule.actionType}) لمستلم ${message.author.tag}`);
        
        // التحقق من نوع الحدث المبرمج تلقائياً وتنفيذه
        switch (rule.actionType) {
          case 'reply_text':
            await message.reply(rule.actionData.text || "تم التفعيل بنجاح!");
            break;

          case 'reply_image':
            await message.reply({
              content: rule.actionData.text || "إليك الصورة المطلوبة:",
              files: [rule.actionData.imageUrl]
            });
            break;

          case 'sequential_replies':
            // جلب العداد لهذا العضو وخادمه لهذه القاعدة بالتحديد
            const counterKey = `${message.guildId}-${message.author.id}-${rule.id}`;
            let currentCount = sequentialCounters.get(counterKey) || 0;
            const replies = rule.actionData.replies || [];
            
            if (replies.length > 0) {
              const replyObj = replies[currentCount % replies.length];
              currentCount++;
              sequentialCounters.set(counterKey, currentCount);

              if (replyObj.type === 'image' || replyObj.content.startsWith('http')) {
                await message.reply({
                  content: `[الخطوة والمحاولة ${currentCount}]: ${replyObj.description || 'طلبك التتابعي متاح هنا'}`,
                  files: [replyObj.content]
                });
              } else {
                await message.reply(`[الخطوة والمحاولة ${currentCount}]: ${replyObj.content}`);
              }
            }
            break;

          case 'create_role':
            if (!message.guild?.members.me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
              return message.reply('❌ عذرًا، لا تتوفر لدي صلاحية إدارة الأدوار (Manage Roles) لإنشاء الرتبة!');
            }
            const rData = rule.actionData;
            const role = await message.guild.roles.create({
              name: rData.roleName || "رتبة جديدة مبرمجة",
              color: rData.color || "#00f0ff",
              permissions: rData.permissions?.includes("Administrator") ? [PermissionsBitField.Flags.Administrator] : [],
              reason: 'تم الإنشاء تلقائياً بالذكاء الاصطناعي للبوت الإشرافي'
            });
            await message.reply(`✅ تم إنشاء رتبة ديسكورد الراقية بنجاح: ${role} باللون المحدد والصلاحيات الإدارية!`);
            break;

          case 'create_channel':
            if (!message.guild?.members.me?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
              return message.reply('❌ عذرًا، لا تتوفر لدي صلاحية إدارة القنوات (Manage Channels) لإنشاء الروم المطلوب!');
            }
            const cData = rule.actionData;
            const channelType = cData.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
            const newChannel = await message.guild.channels.create({
              name: cData.channelName || "روم-مبرمج-تلقائيا",
              type: channelType,
              reason: 'تم الإنشاء بطلب من المشرف ذكاء اصطناعي'
            });
            await message.reply(`✅ تم بنجاح إنشاء القناة الذكية الجديدة: ${newChannel}`);
            break;

          case 'poll':
            const pData = rule.actionData;
            const pollEmbed = new EmbedBuilder()
              .setColor('#ff9100')
              .setTitle(`Vote: ${pData.title || 'تصويت الإدارة العام'}`)
              .setDescription('يرجى التفاعل بالتصويت باستخدام الرموز التعبيرية المفضلة لأسفل لإبداء الرأي للمجتمع!')
              .setFooter({ text: 'تصويت إشرافي فوري موجه لأعضاء الخادم' });
            
            const pollMsg = await (message.channel as any).send({ embeds: [pollEmbed] });
            // إضافة ريأكشنات للتصويت
            await pollMsg.react('👍');
            await pollMsg.react('👎');
            await pollMsg.react('🤷');
            break;

          case 'custom_code':
            await message.reply(`⚡ أمر مخصص بكود مبرمج ذاتياً: ${rule.explanation}`);
            break;
        }

        // تفادي تشغيل قواعد إضافية لنفس الرسالة إذا تطابقت
        break;

      } catch (exError: any) {
        console.error(`❌ خطأ أثناء تنفيذ القاعدة ${rule.name}:`, exError);
        await message.reply(`❌ حدث خطأ أثناء تنفيذ الفعالية التلقائية للقاعدة المبرمجة: ${exError.message}`);
      }
    }
  }
});

// بدء تشغيل البوت والاتصال الفعلي بخوادم ديسكورد
if (DISCORD_TOKEN) {
  client.login(DISCORD_TOKEN).catch(error => {
    console.error("❌ فشل تشغيل البوت والاتصال بديسكورد من خلال التوكن المزود:", error);
  });
}
