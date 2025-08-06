const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

console.log('🤖 Bot WhatsApp Peruano iniciando...');
console.log('👤 Usuario: Pepsi200');
console.log('👨‍💻 Desarrollador: Marcos');
console.log('📅 Fecha: 2025-08-06');

const BOT_PREFIX = '!';

// Base de datos de usuarios registrados
let registeredUsers = {};
let mutedUsers = {};

// Cargar datos guardados al iniciar
function loadData() {
    try {
        if (fs.existsSync('./users.json')) {
            registeredUsers = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
        }
        if (fs.existsSync('./muted.json')) {
            mutedUsers = JSON.parse(fs.readFileSync('./muted.json', 'utf8'));
        }
    } catch (error) {
        console.log('📄 Creando archivos de datos...');
        registeredUsers = {};
        mutedUsers = {};
    }
}

// Guardar datos
function saveData() {
    try {
        fs.writeFileSync('./users.json', JSON.stringify(registeredUsers, null, 2));
        fs.writeFileSync('./muted.json', JSON.stringify(mutedUsers, null, 2));
    } catch (error) {
        console.error('❌ Error guardando datos:', error);
    }
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// Funciones utilitarias
function isRegistered(userId) {
    return registeredUsers.hasOwnProperty(userId);
}

function isMuted(userId) {
    return mutedUsers.hasOwnProperty(userId) && mutedUsers[userId].until > Date.now();
}

// Función para verificar si es admin del grupo de WhatsApp
async function isGroupAdmin(chat, userId) {
    try {
        if (!chat.isGroup) return false;
        
        const participants = chat.participants;
        const participant = participants.find(p => p.id._serialized === userId);
        
        return participant && participant.isAdmin;
    } catch (error) {
        console.error('Error verificando admin:', error);
        return false;
    }
}

function registerUser(userId, name, contact, isGroupAdminStatus = false) {
    registeredUsers[userId] = {
        name: name,
        phone: contact.number,
        registerDate: new Date().toISOString(),
        messages: 0,
        commands: 0,
        level: 1,
        experience: 0,
        warnings: 0,
        isAdmin: isGroupAdminStatus
    };
    saveData();
}

// Función para actualizar estado de admin
async function updateAdminStatus(userId, chat) {
    if (!isRegistered(userId) || !chat.isGroup) return false;
    
    const isAdmin = await isGroupAdmin(chat, userId);
    const user = registeredUsers[userId];
    
    if (user.isAdmin !== isAdmin) {
        user.isAdmin = isAdmin;
        saveData();
        return true; // Status changed
    }
    return false;
}

function addExperience(userId, exp = 1) {
    if (!isRegistered(userId)) return false;
    
    const user = registeredUsers[userId];
    user.experience += exp;
    user.commands += 1;
    
    const newLevel = Math.floor(user.experience / 15) + 1;
    if (newLevel > user.level) {
        user.level = newLevel;
        saveData();
        return true; // Level up!
    }
    saveData();
    return false;
}

async function tagAll(chat, message = '') {
    try {
        const participants = chat.participants;
        let mentions = [];
        let text = message + '\n\n';
        
        for (let participant of participants) {
            mentions.push(participant.id._serialized);
            const contact = await client.getContactById(participant.id._serialized);
            text += `@${contact.number} `;
        }
        
        await chat.sendMessage(text, { mentions });
    } catch (error) {
        console.error('Error al etiquetar:', error);
    }
}

function muteUser(userId, minutes = 5) {
    mutedUsers[userId] = {
        until: Date.now() + (minutes * 60 * 1000),
        mutedAt: new Date().toISOString()
    };
    saveData();
}

function unmuteUser(userId) {
    delete mutedUsers[userId];
    saveData();
}

// Cargar datos al iniciar
loadData();

client.on('qr', (qr) => {
    console.log('📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:');
    qrcode.generate(qr, { small: true });
    console.log('💡 WhatsApp > Dispositivos vinculados > Vincular dispositivo');
});

client.on('ready', () => {
    console.log('✅ ¡BOT CONECTADO! 🎉');
    console.log('🇵🇪 Bot peruano funcionando en Termux');
    console.log('👥 Usuarios registrados:', Object.keys(registeredUsers).length);
});

client.on('message_create', async (message) => {
    if (message.fromMe) return;
    
    const chat = await message.getChat();
    const contact = await message.getContact();
    const userId = message.author || message.from;
    
    // Actualizar estado de admin automáticamente
    if (isRegistered(userId)) {
        await updateAdminStatus(userId, chat);
    }
    
    // Verificar si el usuario está silenciado
    if (isMuted(userId)) {
        const userIsAdmin = isRegistered(userId) ? registeredUsers[userId].isAdmin : await isGroupAdmin(chat, userId);
        if (!userIsAdmin) {
            await message.reply('🔇 Estás silenciado temporalmente. No puedes usar comandos.');
            return;
        }
    }
    
    // Contar mensajes si está registrado
    if (isRegistered(userId)) {
        registeredUsers[userId].messages += 1;
        saveData();
    }
    
    if (message.body.startsWith(BOT_PREFIX)) {
        const args = message.body.slice(BOT_PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        // ===== COMANDO REGISTRAR (DISPONIBLE PARA TODOS) =====
        if (command === 'registrar') {
            if (isRegistered(userId)) {
                await message.reply('❌ Ya estás registrado en el sistema.\nUsa !perfil para ver tu información.');
                return;
            }
            
            if (args.length === 0) {
                await message.reply('❌ Debes escribir tu nombre.\nEjemplo: !registrar Juan Carlos');
                return;
            }
            
            const nombre = args.join(' ');
            if (nombre.length < 2 || nombre.length > 30) {
                await message.reply('❌ El nombre debe tener entre 2 y 30 caracteres.');
                return;
            }
            
            // Verificar si es admin del grupo al registrarse
            const isGroupAdminStatus = await isGroupAdmin(chat, userId);
            registerUser(userId, nombre, contact, isGroupAdminStatus);
            
            const welcomeMsg = `🎉 ¡REGISTRO EXITOSO! 🎉\n\n` +
                `👤 Nombre: ${nombre}\n` +
                `📱 Teléfono: ${contact.number}\n` +
                `🏆 Nivel inicial: 1\n` +
                `⭐ Experiencia: 0\n` +
                `${isGroupAdminStatus ? '🛡️ Estado: Administrador del grupo\n' : '👤 Estado: Miembro\n'}` +
                `📅 Fecha: ${new Date().toLocaleDateString()}\n\n` +
                `🎮 ¡Ya puedes usar todos los comandos!\n` +
                `💡 Usa !help para ver los comandos disponibles\n\n` +
                `🇵🇪 ¡Bienvenido a la comunidad peruana!\n\n` +
                `👨‍💻 Bot desarrollado por Marcos`;
            
            await message.reply(welcomeMsg);
            return;
        }
        
        // ===== VERIFICAR REGISTRO PARA OTROS COMANDOS =====
        if (!isRegistered(userId) && command !== 'help') {
            await message.reply('❌ Debes registrarte primero.\nUsa: !registrar [tu nombre]\nEjemplo: !registrar Juan Carlos');
            return;
        }
        
        // Agregar experiencia por usar comandos
        const levelUp = addExperience(userId, 2);
        if (levelUp) {
            await message.reply(`🎊 ¡SUBISTE DE NIVEL! 🎊\n\n⭐ Nuevo nivel: ${registeredUsers[userId].level}\n🏆 ¡Felicidades ${registeredUsers[userId].name}! 🇵🇪`);
        }
        
        // ===== COMANDOS PARA USUARIOS REGISTRADOS =====
        
        if (command === 'help' || command === 'ayuda') {
            const user = registeredUsers[userId];
            const isUserAdmin = user ? user.isAdmin : false;
            
            let helpText = `🤖 *BOT WHATSAPP PERUANO* 🇵🇪\n👨‍💻 *Desarrollador: Marcos*\n\n`;
            
            if (!isRegistered(userId)) {
                helpText += `❗ *PRIMERO REGÍSTRATE:*\n• !registrar [nombre] - Registrarse en el bot\n\n`;
            }
            
            helpText += `👥 *COMANDOS PARA MIEMBROS:*\n` +
                `• !help - Esta ayuda\n` +
                `• !perfil - Ver tu perfil\n` +
                `• !ping - Velocidad del bot\n` +
                `• !dados - Tirar dados\n` +
                `• !moneda - Lanzar moneda\n` +
                `• !chiste - Chiste peruano\n` +
                `• !frase - Frase peruana\n` +
                `• !amor - Calculadora del amor\n` +
                `• !piedra [opción] - Piedra/papel/tijera\n` +
                `• !saludo - Saludo personalizado\n` +
                `• !info - Info del bot\n` +
                `• !ranking - Top usuarios\n\n`;
            
            if (isUserAdmin) {
                helpText += `🛡️ *COMANDOS DE ADMIN DEL GRUPO:*\n` +
                    `• !tag - Etiquetar a todos\n` +
                    `• !todos [mensaje] - Tag personalizado\n` +
                    `• !mute @usuario [minutos] - Silenciar usuario\n` +
                    `• !unmute @usuario - Quitar silencio\n` +
                    `• !warn @usuario - Advertir usuario\n` +
                    `• !usuarios - Lista de usuarios\n` +
                    `• !stats - Estadísticas del bot\n\n`;
            } else {
                helpText += `💡 *NOTA:* Si eres admin del grupo, tendrás comandos adicionales\n\n`;
            }
            
            helpText += `🎮 ¡Gana experiencia usando comandos!\n🇵🇪 ¡Hecho en Perú por Marcos!`;
            
            await message.reply(helpText);
        }
        
        else if (command === 'perfil') {
            const user = registeredUsers[userId];
            const joinDate = new Date(user.registerDate).toLocaleDateString();
            const nextLevelExp = (user.level * 15) - user.experience;
            
            const profileText = `👤 *PERFIL DE ${user.name.toUpperCase()}* 🇵🇪\n\n` +
                `📱 Teléfono: ${user.phone}\n` +
                `📅 Miembro desde: ${joinDate}\n` +
                `💬 Mensajes enviados: ${user.messages}\n` +
                `🎮 Comandos usados: ${user.commands}\n` +
                `⭐ Nivel actual: ${user.level}\n` +
                `🏆 Experiencia: ${user.experience}\n` +
                `📈 Para subir nivel: ${nextLevelExp} exp\n` +
                `⚠️ Advertencias: ${user.warnings}\n` +
                `🛡️ Estado: ${user.isAdmin ? 'Admin del grupo' : 'Miembro'}\n\n` +
                `${user.level >= 10 ? '🏅 ¡Usuario veterano!' : user.level >= 5 ? '⭐ ¡Usuario activo!' : '🌱 ¡Sigue participando!'}\n\n` +
                `👨‍💻 Bot de Marcos`;
            
            await message.reply(profileText);
        }
        
        else if (command === 'ping') {
            const start = Date.now();
            const sent = await message.reply('🏃‍♂️ Midiendo velocidad...');
            const end = Date.now();
            const speed = end - start;
            const user = registeredUsers[userId];
            
            let emoji = speed < 100 ? '🚀' : speed < 500 ? '🏃‍♂️' : '🐌';
            await message.reply(`${emoji} *Pong ${user.name}!*\n\n⚡ Velocidad: ${speed}ms\n${speed < 100 ? '¡Súper rápido pe!' : speed < 500 ? 'Normal nomás' : 'Medio lento causa'}\n\n👨‍💻 Bot de Marcos`);
        }
        
        else if (command === 'dados') {
            const result1 = Math.floor(Math.random() * 6) + 1;
            const result2 = Math.floor(Math.random() * 6) + 1;
            const total = result1 + result2;
            const user = registeredUsers[userId];
            
            let mensaje = total >= 10 ? '¡Excelente tirada!' : total >= 7 ? '¡Buena suerte!' : '¡Mala suerte pe!';
            
            await message.reply(`🎲🎲 *${user.name}* tiró los dados:\n\n🎲 Dado 1: ${result1}\n🎲 Dado 2: ${result2}\n🏆 Total: ${total}\n\n${mensaje} 🇵🇪\n\n👨‍💻 Juego de Marcos`);
        }
        
        else if (command === 'ranking') {
            const sortedUsers = Object.entries(registeredUsers)
                .sort((a, b) => b[1].experience - a[1].experience)
                .slice(0, 10);
            
            let rankingText = '🏆 *TOP 10 USUARIOS* 🇵🇪\n\n';
            
            sortedUsers.forEach((entry, index) => {
                const [id, user] = entry;
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                const adminBadge = user.isAdmin ? ' 🛡️' : '';
                rankingText += `${medal} ${user.name}${adminBadge} - Nivel ${user.level} (${user.experience} exp)\n`;
            });
            
            rankingText += '\n👨‍💻 Ranking creado por Marcos';
            await message.reply(rankingText);
        }
        
        // ===== COMANDOS SOLO PARA ADMINS DEL GRUPO =====
        
        else if (command === 'tag') {
            if (!chat.isGroup) {
                await message.reply('❌ Este comando solo funciona en grupos.');
                return;
            }
            
            const user = registeredUsers[userId];
            if (!user.isAdmin) {
                await message.reply('❌ Solo los administradores del grupo pueden usar este comando.');
                return;
            }
            
            await tagAll(chat, '🌿 DESPIERTEN PLANTAS PERUANASSS 🌿');
        }
        
        else if (command === 'todos') {
            if (!chat.isGroup) {
                await message.reply('❌ Este comando solo funciona en grupos.');
                return;
            }
            
            const user = registeredUsers[userId];
            if (!user.isAdmin) {
                await message.reply('❌ Solo los administradores del grupo pueden usar este comando.');
                return;
            }
            
            const customMessage = args.join(' ') || '📢 Atención grupo!';
            await tagAll(chat, customMessage);
        }
        
        else if (command === 'mute') {
            if (!chat.isGroup) {
                await message.reply('❌ Este comando solo funciona en grupos.');
                return;
            }
            
            const user = registeredUsers[userId];
            if (!user.isAdmin) {
                await message.reply('❌ Solo los administradores del grupo pueden usar este comando.');
                return;
            }
            
            const quotedMessage = await message.getQuotedMessage();
            if (!quotedMessage) {
                await message.reply('❌ Responde al mensaje del usuario que quieres silenciar.\nEjemplo: Responder mensaje + !mute 10');
                return;
            }
            
            const targetUserId = quotedMessage.author || quotedMessage.from;
            const minutes = parseInt(args[0]) || 5;
            
            if (minutes < 1 || minutes > 1440) {
                await message.reply('❌ Los minutos deben estar entre 1 y 1440 (24 horas).');
                return;
            }
            
            // Verificar si el objetivo también es admin
            const targetIsAdmin = isRegistered(targetUserId) ? registeredUsers[targetUserId].isAdmin : await isGroupAdmin(chat, targetUserId);
            if (targetIsAdmin) {
                await message.reply('❌ No puedes silenciar a otro administrador del grupo.');
                return;
            }
            
            muteUser(targetUserId, minutes);
            
            const targetContact = await client.getContactById(targetUserId);
            const targetName = isRegistered(targetUserId) ? registeredUsers[targetUserId].name : targetContact.number;
            
            await message.reply(`🔇 *Usuario silenciado por ${user.name}*\n\n👤 Usuario: ${targetName}\n⏰ Duración: ${minutes} minutos\n📅 Hasta: ${new Date(Date.now() + minutes * 60 * 1000).toLocaleString()}\n\n👨‍💻 Sistema de Marcos`);
        }
        
        else if (command === 'unmute') {
            if (!chat.isGroup) {
                await message.reply('❌ Este comando solo funciona en grupos.');
                return;
            }
            
            const user = registeredUsers[userId];
            if (!user.isAdmin) {
                await message.reply('❌ Solo los administradores del grupo pueden usar este comando.');
                return;
            }
            
            const quotedMessage = await message.getQuotedMessage();
            if (!quotedMessage) {
                await message.reply('❌ Responde al mensaje del usuario que quieres quitar el silencio.');
                return;
            }
            
            const targetUserId = quotedMessage.author || quotedMessage.from;
            
            if (!isMuted(targetUserId)) {
                await message.reply('❌ Este usuario no está silenciado.');
                return;
            }
            
            unmuteUser(targetUserId);
            
            const targetContact = await client.getContactById(targetUserId);
            const targetName = isRegistered(targetUserId) ? registeredUsers[targetUserId].name : targetContact.number;
            
            await message.reply(`🔊 *Silencio removido por ${user.name}*\n\n👤 Usuario: ${targetName}\n✅ Ya puede usar comandos nuevamente\n\n👨‍💻 Sistema de Marcos`);
        }
        
        else if (command === 'warn') {
            if (!chat.isGroup) {
                await message.reply('❌ Este comando solo funciona en grupos.');
                return;
            }
            
            const user = registeredUsers[userId];
            if (!user.isAdmin) {
                await message.reply('❌ Solo los administradores del grupo pueden usar este comando.');
                return;
            }
            
            const quotedMessage = await message.getQuotedMessage();
            if (!quotedMessage) {
                await message.reply('❌ Responde al mensaje del usuario que quieres advertir.');
                return;
            }
            
            const targetUserId = quotedMessage.author || quotedMessage.from;
            
            if (!isRegistered(targetUserId)) {
                await message.reply('❌ El usuario no está registrado en el sistema.');
                return;
            }
            
            const targetUser = registeredUsers[targetUserId];
            if (targetUser.isAdmin) {
                await message.reply('❌ No puedes advertir a otro administrador del grupo.');
                return;
            }
            
            targetUser.warnings += 1;
            const warnings = targetUser.warnings;
            saveData();
            
            let action = '';
            if (warnings >= 3) {
                muteUser(targetUserId, 30);
                action = '\n⚠️ Silenciado 30 minutos por 3 advertencias';
            }
            
            await message.reply(`⚠️ *Usuario advertido por ${user.name}*\n\n👤 Usuario: ${targetUser.name}\n📊 Advertencias: ${warnings}/3${action}\n\n👨‍💻 Sistema de Marcos`);
        }
        
        else if (command === 'usuarios') {
            const user = registeredUsers[userId];
            if (!user.isAdmin) {
                await message.reply('❌ Solo los administradores del grupo pueden usar este comando.');
                return;
            }
            
            const totalUsers = Object.keys(registeredUsers).length;
            const admins = Object.values(registeredUsers).filter(u => u.isAdmin).length;
            const members = totalUsers - admins;
            
            await message.reply(`👥 *USUARIOS REGISTRADOS*\n\n📊 Total: ${totalUsers}\n🛡️ Admins del grupo: ${admins}\n👤 Miembros: ${members}\n📅 Sistema creado por Marcos`);
        }
        
        else if (command === 'stats') {
            const user = registeredUsers[userId];
            if (!user.isAdmin) {
                await message.reply('❌ Solo los administradores del grupo pueden usar este comando.');
                return;
            }
            
            const totalMessages = Object.values(registeredUsers).reduce((sum, user) => sum + user.messages, 0);
            const totalCommands = Object.values(registeredUsers).reduce((sum, user) => sum + user.commands, 0);
            const mutedCount = Object.keys(mutedUsers).filter(id => isMuted(id)).length;
            
            await message.reply(`📊 *ESTADÍSTICAS DEL BOT*\n\n👥 Usuarios registrados: ${Object.keys(registeredUsers).length}\n💬 Mensajes totales: ${totalMessages}\n🎮 Comandos ejecutados: ${totalCommands}\n🔇 Usuarios silenciados: ${mutedCount}\n👨‍💻 Desarrollador: Marcos\n📅 ${new Date().toLocaleDateString()}`);
        }
        
        // ===== COMANDOS DIVERTIDOS PARA TODOS =====
        
        else if (command === 'moneda') {
            const result = Math.random() < 0.5 ? 'Cara' : 'Cruz';
            const user = registeredUsers[userId];
            await message.reply(`🪙 *${user.name}* lanzó una moneda:\n\n**Resultado: ${result}**\n\n${result === 'Cara' ? '¡Buena suerte pe! 🍀' : '¡Mala suerte causa! 😅'}\n\n👨‍💻 Juego de Marcos`);
        }
        
        else if (command === 'chiste') {
            const chistes = [
                '¿Por qué los peruanos no juegan poker en la selva? ¡Porque hay muchos leopardos! 🐆',
                '¿Qué le dice un inca a otro inca? ¡Inca-reíble! 😂',
                '¿Por qué el cuy no puede ser chef? ¡Porque siempre se cocina solo! 🐹',
                '¿Cómo llamas a un peruano en el espacio? ¡Un astro-nauta! 🚀',
                '¿Por qué los limeños no pueden ser magos? ¡Porque siempre dicen "ya pe"! 🎩'
            ];
            const chiste = chistes[Math.floor(Math.random() * chistes.length)];
            const user = registeredUsers[userId];
            await message.reply(`😂 *Chiste para ${user.name}:*\n\n${chiste}\n\n🇵🇪 ¡Creado por Marcos!`);
        }
        
        else if (command === 'frase') {
            const frases = [
                'Chévere pues causa! 🇵🇪',
                'Todo joya pe! ✨',
                'Qué tal hermano! 👋',
                'Bacán pe! 😎',
                'Qué hay de nuevo pana! 🤙',
                'Todo chévere causa! 👍'
            ];
            const frase = frases[Math.floor(Math.random() * frases.length)];
            const user = registeredUsers[userId];
            await message.reply(`💬 *${user.name}:* ${frase}\n\n👨‍💻 Frases de Marcos`);
        }
        
        else if (command === 'amor') {
            const porcentaje = Math.floor(Math.random() * 101);
            const user = registeredUsers[userId];
            
            let mensaje = '';
            if (porcentaje >= 80) mensaje = '¡Amor verdadero pe! 💕';
            else if (porcentaje >= 60) mensaje = 'Buena compatibilidad causa 💖';
            else if (porcentaje >= 40) mensaje = 'Puede ser hermano 💛';
            else if (porcentaje >= 20) mensaje = 'Medio complicado pe 💔';
            else mensaje = 'Mejor busca otro cause 💸';
            
            await message.reply(`💘 *Calculadora del amor para ${user.name}*\n\n❤️ Porcentaje: ${porcentaje}%\n${mensaje}\n\n🇵🇪 Con amor, Marcos`);
        }
        
        else if (command === 'piedra') {
            const opciones = ['piedra', 'papel', 'tijera'];
            const botChoice = opciones[Math.floor(Math.random() * 3)];
            const userChoice = args[0]?.toLowerCase();
            const user = registeredUsers[userId];
            
            if (!userChoice || !opciones.includes(userChoice)) {
                await message.reply(`🎮 ${user.name}, elige una opción:\n!piedra piedra/papel/tijera\n\nEjemplo: !piedra papel`);
                return;
            }
            
            let resultado = '';
            if (userChoice === botChoice) resultado = 'Empate pe! 🤝';
            else if (
                (userChoice === 'piedra' && botChoice === 'tijera') ||
                (userChoice === 'papel' && botChoice === 'piedra') ||
                (userChoice === 'tijera' && botChoice === 'papel')
            ) resultado = '¡Ganaste causa! 🎉';
            else resultado = '¡Perdiste hermano! 😅';
            
            await message.reply(`🎮 *${user.name} vs Bot*\n\n👤 Tú: ${userChoice}\n🤖 Bot: ${botChoice}\n\n${resultado}\n\n🇵🇪 Juego creado por Marcos`);
        }
        
        else if (command === 'saludo') {
            const user = registeredUsers[userId];
            const saludos = [
                `¡Hola ${user.name}! ¿Cómo estás pe? 🇵🇪`,
                `¡Qué tal ${user.name}! Todo bien causa? 😊`,
                `¡Saludos ${user.name}! ¿Qué hay de nuevo? 👋`,
                `¡Eyyy ${user.name}! ¿Cómo andas hermano? 🤙`
            ];
            const saludo = saludos[Math.floor(Math.random() * saludos.length)];
            await message.reply(`${saludo}\n\n👨‍💻 Saludos de Marcos`);
        }
        
        else if (command === 'info') {
            await message.reply(`🤖 *BOT WHATSAPP PERUANO* 🇵🇪\n\n👨‍💻 Desarrollador: **Marcos**\n👤 Usuario Termux: Pepsi200\n📅 Creado: 2025\n⚡ Estado: Online\n🔧 Versión: 3.0\n👥 Usuarios registrados: ${Object.keys(registeredUsers).length}\n\n📱 Ejecutándose en Termux\n🚀 Powered by WhatsApp Web\n🇵🇪 ¡Hecho con amor peruano!\n\n🛡️ Los admins del grupo tienen comandos especiales`);
        }
        
        else {
            await message.reply(`❌ Comando no reconocido pe!\n\nUsa *!help* para ver todos los comandos disponibles 🤖\n\n👨‍💻 Bot creado por Marcos`);
        }
    }
    
    // Respuestas automáticas (solo para usuarios registrados)
    if (isRegistered(userId)) {
        const messageText = message.body.toLowerCase();
        const user = registeredUsers[userId];
        
        if (messageText.includes('hola bot') || messageText.includes('hola bb')) {
            await message.reply(`¡Hola ${user.name}! ¿Cómo estás pe? 🇵🇪\n\n👨‍💻 Saludos de Marcos`);
        }
        
        if (messageText.includes('gracias bot')) {
            await message.reply(`De nada ${user.name}! Para eso estoy pe 😊🇵🇪\n\n👨‍💻 Bot de Marcos`);
        }
        
        if (messageText.includes('bot tonto') || messageText.includes('bot malo')) {
            await message.reply(`Oe ${user.name}, respeta pe! 😠 Soy un bot peruano con sentimientos 🇵🇪💔\n\nCreado con amor por Marcos`);
        }
    }
});

// Eventos de grupo
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const contact = await notification.getContact();
        
        const welcomeMessage = `🎉 ¡BIENVENIDO PEEE CAUSAAA! 🎉\n\n👋 @${contact.number}\n\n🇵🇪 ¡Esperamos que disfrutes tu estadía aquí!\n\n📝 **IMPORTANTE:** Regístrate con !registrar [tu nombre]\n💡 Luego usa !help para ver todos los comandos\n\n🛡️ Si eres admin del grupo, tendrás comandos especiales\n\n👨‍💻 Bot creado por **Marcos**`;
        
        await chat.sendMessage(welcomeMessage, {
            mentions: [contact.id._serialized]
        });
    } catch (error) {
        console.error('Error en mensaje de bienvenida:', error);
    }
});

client.on('group_leave', async (notification) => {
    try {
        const chat = await notification.getChat();
        const contact = await notification.getContact();
        
        const userName = isRegistered(contact.id._serialized) ? 
            registeredUsers[contact.id._serialized].name : 
            contact.number;
        
        const goodbyeMessage = `👋 SE FUE NUNCA NOS IMPORTA 👋\n\n🚪 @${contact.number} (${userName})\n\n😒 ¡Que le vaya bien en su nueva aventura! 🇵🇪\n\n👨‍💻 Bot de Marcos`;
        
        await chat.sendMessage(goodbyeMessage, {
            mentions: [contact.id._serialized]
        });
    } catch (error) {
        console.error('Error en mensaje de despedida:', error);
    }
});

// Manejo de errores
client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('🔌 Bot desconectado:', reason);
    console.log('🔄 Intentando reconectar...');
});

// Limpiar usuarios silenciados expirados cada 5 minutos
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    Object.keys(mutedUsers).forEach(userId => {
        if (mutedUsers[userId].until <= now) {
            delete mutedUsers[userId];
            cleaned++;
        }
    });
    
    if (cleaned > 0) {
        saveData();
        console.log(`🧹 Limpieza automática: ${cleaned} silenciados expirados`);
    }
}, 5 * 60 * 1000);

// Inicializar cliente
client.initialize();

console.log('🎯 Sistema de registro activado');
console.log('🔇 Sistema de mute activado');
console.log('🛡️ Detección automática de admins de grupo');
console.log('👨‍💻 Desarrollado por Marcos');