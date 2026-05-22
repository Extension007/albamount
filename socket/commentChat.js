// Обработчик WebSocket-событий для чата комментариев
const Comment = require("../models/Comment");
const Product = require("../models/Product");
const User = require("../models/User");
const { verifyToken } = require("../config/jwt");
const { checkChatAccess } = require("../middleware/comments");

// Хранилище активных комнат чата
const activeRooms = new Map();

/**
 * Проверка прав доступа к чату карточки
 */
async function checkCardAccess(cardId, user) {
   try {
      // Проверяем, существует ли карточка (Product или Service)
      let card = await Product.findByPk(cardId);
     if (card) {
       // Проверяем, является ли пользователь владельцем карточки или администратором
        const isAdmin = user.role === 'admin';
        const isOwner = card.ownerId === user.id;
       
       // Определяем тип карточки
       let cardType = 'Product';
       if (card.type === 'service') {
         cardType = 'Service';
       }
       
       return { allowed: isAdmin || isOwner || card.status === 'approved', isCardOwner: isOwner, cardType: cardType };
     }

     return { allowed: false, isCardOwner: false, cardType: null };
   } catch (error) {
    console.error('❌ Ошибка проверки прав доступа к чату:', error);
    return { allowed: false, isCardOwner: false, cardType: null };
  }
}

/**
 * Инициализация WebSocket-сервера для чата комментариев
 */
module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('👤 Пользователь подключился к чату:', socket.id);
    
    // Определяем пользователя при подключении
    socket.user = null;
    
    // Пытаемся получить пользователя из разных источников
    const authenticateUser = async () => {
      try {
        // 1. Пробуем JWT токен из cookies
        const cookies = socket.request.headers.cookie;
        if (cookies) {
          const tokenMatch = cookies.match(/exto_token=([^;]+)/);
          if (tokenMatch) {
            const token = tokenMatch[1];
            const decoded = verifyToken(token);
            if (decoded && decoded._id) {
               const user = await User.findByPk(decoded._id);
              if (user) {
                return user;
              }
            }
          }
        }
        
        // 2. Пробуем сессию
        const session = socket.request.session;
        if (session && session.user) {
          const sessionUser = session.user;
          const userId = sessionUser._id || sessionUser;
          const sessionDbUser = await User.findByPk(userId);
          if (sessionDbUser) {
            return sessionDbUser;
          }
        }
        
        return null;
      } catch (error) {
        console.error('❌ Ошибка аутентификации пользователя:', error);
        return null;
      }
    };
    
    // Аутентифицируем пользователя при подключении
    authenticateUser().then(user => {
      socket.user = user;
     if (user) {
       console.log(`👤 Пользователь ${user.username || user.email} (ID: ${user.id}, роль: ${user.role || 'user'}) подключился к чату`);
     } else {
       console.log('👤 Гость подключился к чату');
     }
    });
    
    // Обработчик присоединения к чату карточки
    socket.on('join-comment-chat', async ({ cardId }) => {
      try {
        // Используем пользователя, определенного при подключении
        let user = socket.user;
        
        if (!user) {
          // Пытаемся аутентифицировать еще раз (на случай, если подключение произошло после аутентификации)
          user = await authenticateUser();
          socket.user = user;
        }

        // Проверяем права доступа к карточке
        const accessCheck = await checkChatAccess(cardId, user);
        if (!accessCheck.allowed) {
          socket.emit('error', { message: accessCheck.reason || 'Нет прав для доступа к чату этой карточки' });
          return;
        }

        // Присоединяемся к комнате карточки
        const roomName = `card_${cardId}`;
        socket.join(roomName);

         // Сохраняем информацию о соединении
         const connectionInfo = {
           socketId: socket.id,
           userId: user ? user.id : null,
           cardId: cardId,
           joinedAt: new Date(),
           user: user,
           canWrite: accessCheck.canWrite,
           canModerate: accessCheck.canModerate
         };

        if (!activeRooms.has(cardId)) {
          activeRooms.set(cardId, new Map());
        }
        activeRooms.get(cardId).set(socket.id, connectionInfo);

         if (user) {
           console.log(`💬 Пользователь ID:${user.id} присоединился к чату карточки ${cardId}`);
         } else {
           console.log(`💬 Гость присоединился к чату карточки ${cardId}`);
         }

        // Отправляем подтверждение успешного присоединения
        socket.emit('joined-comment-chat', {
          success: true,
          cardId: cardId,
          canWrite: accessCheck.canWrite,
          canModerate: accessCheck.canModerate,
          isCardOwner: accessCheck.isOwner
        });

         // Уведомляем других участников чата о новом пользователе (только если авторизован)
         if (user) {
           socket.to(roomName).emit('user-joined-chat', {
             userId: user.id,
             username: user.username || 'Пользователь',
             joinedAt: new Date()
           });
         }
      } catch (error) {
        console.error('❌ Ошибка присоединения к чату:', error);
        socket.emit('error', { message: 'Ошибка подключения к чату' });
      }
    });
    
    // Обработчик отправки сообщения в чат
    socket.on('send-comment-message', async ({ cardId, text }) => {
      try {
        // Используем пользователя, определенного при подключении
        let user = socket.user;
        
        if (!user) {
          user = await authenticateUser();
          socket.user = user;
        }

        if (!user) {
          socket.emit('error', { message: 'Необходима аутентификация для отправки сообщения' });
          return;
        }

        // Проверяем права доступа
        const accessCheck = await checkChatAccess(cardId, user);
        if (!accessCheck.allowed || !accessCheck.canWrite) {
          socket.emit('error', { message: 'Нет прав для отправки сообщения в этот чат' });
          return;
        }

        // Валидация сообщения
        if (!text || text.trim().length === 0) {
          socket.emit('error', { message: 'Текст сообщения не может быть пустым' });
          return;
        }

        if (text.trim().length > 1000) {
          socket.emit('error', { message: 'Сообщение слишком длинное (максимум 1000 символов)' });
          return;
        }

         // Создаем комментарий
         const comment = await Comment.create({
           cardId: cardId,
           cardType: accessCheck.cardType,
           userId: user.id,
           text: text.trim()
         });

         const fullComment = await Comment.findByPk(comment.id, {
           include: [{ model: User, as: 'user', attributes: ['id', 'username', 'email'] }]
         });

         const roomName = `card_${cardId}`;
         io.to(roomName).emit('comment:new', {
           id: fullComment.id,
           userId: fullComment.userId,
           username: fullComment.user?.username || fullComment.user?.email || 'Пользователь',
           canModerate: accessCheck.canModerate,
           isCardOwner: accessCheck.isOwner,
           text: comment.text,
           createdAt: comment.createdAt
         });

         console.log(`💬 Сообщение отправлено в чат карточки ${cardId} пользователем ${user.id} (${user.role})`);
      } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        socket.emit('error', { message: 'Ошибка отправки сообщения' });
      }
    });

    // Обработчик редактирования комментария (только админы)
    socket.on('edit-comment-message', async ({ commentId, text }) => {
      try {
        // Используем пользователя, определенного при подключении
        let user = socket.user;
        
        if (!user) {
          user = await authenticateUser();
          socket.user = user;
        }

        if (!user || user.role !== 'admin') {
          socket.emit('error', { message: 'Только администраторы могут редактировать комментарии' });
          return;
        }

        // Валидация
        if (!text || text.trim().length === 0 || text.trim().length > 1000) {
          socket.emit('error', { message: 'Текст комментария должен быть от 1 до 1000 символов' });
          return;
        }

        // Находим и обновляем комментарий
        const comment = await Comment.findByPk(commentId);
        if (!comment) {
          socket.emit('error', { message: 'Комментарий не найден' });
          return;
        }

        comment.text = text.trim();
        await comment.save();

         // Отправляем обновление всем участникам комнаты
         const roomName = `card_${comment.cardId}`;
         io.to(roomName).emit('comment:updated', {
           id: comment.id,
           text: comment.text,
           updatedAt: comment.updatedAt
         });

         console.log(`💬 Комментарий ${comment.id} отредактирован администратором ${user.id} (${user.role})`);
      } catch (error) {
        console.error('❌ Ошибка редактирования комментария:', error);
        socket.emit('error', { message: 'Ошибка редактирования комментария' });
      }
    });

    // Обработчик удаления комментария (только админы)
    socket.on('delete-comment-message', async ({ commentId }) => {
      try {
        // Используем пользователя, определенного при подключении
        let user = socket.user;
        
        if (!user) {
          user = await authenticateUser();
          socket.user = user;
        }

        if (!user || user.role !== 'admin') {
          socket.emit('error', { message: 'Только администраторы могут удалять комментарии' });
          return;
        }

        // Находим и мягко удаляем комментарий
        const comment = await Comment.findByPk(commentId);
        if (!comment) {
          socket.emit('error', { message: 'Комментарий не найден' });
          return;
        }

        comment.deleted = true;
        await comment.save();

         // Отправляем уведомление об удалении всем участникам комнаты
         const roomName = `card_${comment.cardId}`;
         io.to(roomName).emit('comment:deleted', {
           id: comment.id
         });

         console.log(`💬 Комментарий ${commentId} удален администратором ${user.id} (${user.role})`);
      } catch (error) {
        console.error('❌ Ошибка удаления комментария:', error);
        socket.emit('error', { message: 'Ошибка удаления комментария' });
      }
    });
    
    // Обработчик отключения от чата
    socket.on('leave-comment-chat', ({ cardId }) => {
      try {
        const roomName = `card_${cardId}`;
        socket.leave(roomName);
        
        // Удаляем информацию о соединении
        if (activeRooms.has(cardId)) {
          activeRooms.get(cardId).delete(socket.id);
          if (activeRooms.get(cardId).size === 0) {
            activeRooms.delete(cardId);
          }
        }
        
        console.log(`💬 Пользователь ${socket.id} покинул чат карточки ${cardId}`);
        
        // Уведомляем других участников чата
        socket.to(roomName).emit('user-left-chat', {
          socketId: socket.id
        });
      } catch (error) {
        console.error('❌ Ошибка при выходе из чата:', error);
      }
    });
    
    // Обработчик отключения пользователя
    socket.on('disconnect', (reason) => {
      console.log('👤 Пользователь отключился:', socket.id, 'причина:', reason);
      
      // Удаляем все соединения пользователя из комнат
      for (const [cardId, connections] of activeRooms.entries()) {
        if (connections.has(socket.id)) {
          const connectionInfo = connections.get(socket.id);
          const roomName = `card_${connectionInfo.cardId}`;
          
          // Уведомляем других участников чата
          socket.to(roomName).emit('user-disconnected', {
            socketId: socket.id,
            userId: connectionInfo.userId
          });
          
          connections.delete(socket.id);
          if (connections.size === 0) {
            activeRooms.delete(cardId);
          }
        }
      }
    });
  });
  
  console.log('✅ WebSocket-сервер для чата комментариев инициализирован');
};
