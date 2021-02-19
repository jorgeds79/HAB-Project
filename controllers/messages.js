const db = require('../db/mysql')
const utils = require('../utils/utils')

const { messageValidator } = require('../validators/message')

const sendInitialMessage = async (req, res) => {
    const { id } = req.params
    const { content } = req.body
    const buyer = req.auth
    console.log(buyer)

    try {
        await messageValidator.validateAsync(req.body)
        const book = await db.getBook(id)

        let seller = []
        if (book.available) {
            seller = await db.getSellerByIdBook(id)
        } else {
            res.status(400).send('Libro no disponible!')
            return
        }

        let idDestination = 0
        if (seller.id !== buyer.id) {
            idDestination = seller.id
        } else {
            res.send('Acción no permitida, ya eres el propietario del libro')
            return
        }

        // comprobamos que no se haya iniciado con anterioridad
        // el chat, ya que éste se inicia siempre desde el 
        // panel de producto, y podríamos acceder al chat desde
        // el propio panel de mensajes o bien desde el panel
        // de producto
        let Chat = await db.checkChat(id, buyer.id)

        if (Chat) {
            await db.sendMessage(Chat.id_chat, id, seller.id, buyer.id, idDestination, content)
            // enviamos mail de notificación al vendedor:
            // utils.sendMessageReceivedMail(seller.email, book.title, `http://${process.env.FRONTEND_DOMAIN}/login`)
        } else {
            Chat = parseInt(`${id}${buyer.id}`)
            await db.sendMessage(Chat, id, seller.id, buyer.id, idDestination, content)
            // utils.sendMessageReceivedMail(seller.email, book.title, `http://${process.env.FRONTEND_DOMAIN}/login`)
        }
    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }

    res.send('Mensaje enviado con éxito!')
}

const getListOfChats = async (req, res) => {
    const decodedToken = req.auth

    try {
        // obtenemos una lista con los chats pertenecientes
        // al usuario y eliminamos duplicados de la lista para tener 
        // una lista "limpia" de chats  
        const allMessages = await db.getAllMessagesOfUser(decodedToken.id)
        const messages = allMessages
            .filter((message) => ((message.id_seller === decodedToken.id) && message.visibleForSeller) ||
                ((message.id_buyer === decodedToken.id) && message.visibleForBuyer))
        const listOfChats = messages
            .map(message => message.id_chat)
            .filter((value, index, array) => array.indexOf(value) === index);
        let listOfChatsTosend = []

        if (listOfChats.length !== 0) {
            for (let chat of listOfChats) {
                const book = await db.getBookByIdChat(chat)
                const seller = await db.getSellerByIdChat(chat)
                const buyer = await db.getBuyerByIdChat(chat)
                const unreadMessages = messages
                    .filter((message) => message.id_chat === chat)
                    .filter((message) => ((message.id_destination === decodedToken.id) && !message.viewed))
                // si "unreadMessages" existe hay mensajes sin leer,
                // marcamos el chat como no leído en el front
                let unread = false
                if (unreadMessages.length !== 0) {
                    unread = true
                }
                const input = {
                    'id_chat': chat,
                    'book_title': book.title,
                    'course': book.course,
                    'seller_name': seller.name,
                    'buyer_name': buyer.name,
                    'unreadChat': unread
                }
                listOfChatsTosend.push(input)
            }

            res.send(listOfChatsTosend)
            return
        } else {
            res.send('No tienes ningun mensaje en tus chats')
        }

    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }
}

const getChatMessages = async (req, res) => {
    const decodedToken = req.auth
    const { id } = req.params
    const book = await db.getBookByIdChat(id)
    const seller = await db.getSellerByIdChat(id)
    const buyer = await db.getBuyerByIdChat(id)
    try {
        // obtenemos los mensajes pertenecientes
        // al usuario y filtramos por id del chat 
        const allMessages = await db.getAllMessagesOfUser(decodedToken.id)
        const chatMessages = allMessages
            .filter((message) => ((message.id_seller === decodedToken.id) && message.visibleForSeller) ||
                ((message.id_buyer === decodedToken.id) && message.visibleForBuyer))
            .filter((message) => message.id_chat === id)

        await db.setMessagesToViewed(id, decodedToken.id)

        let listOfMessagesTosend = []
        for (let message of chatMessages) {

            const input = {
                'id': message.id,
                'id_chat': id,
                'book_title': book.title,
                'course': book.course,
                'id_seller': seller.id,
                'seller_name': seller.name,
                'id_buyer': buyer.id,
                'buyer_name': buyer.name,
                'id_destination': message.id_destination,
                'content': message.content,
                'date': `${message.creation_date.toISOString().slice(0, 10)} a las ${message.creation_date.toISOString().slice(11, 16)}`
            }
            listOfMessagesTosend.push(input)
        }

        res.send(listOfMessagesTosend)
        return
    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }
}

const sendReplyMessage = async (req, res) => {
    const { id } = req.params
    const { content } = req.body
    const sender = req.auth

    try {
        await messageValidator.validateAsync(req.body)
        const messages = await db.getMessagesOfChat(id)
        const data = messages[0]

        if (data.id_seller !== sender.id && data.id_buyer !== sender.id) {
            res.status(400).send()
            return
        }
        let idDestination = data.id_seller

        if (sender.id === data.id_seller) {
            idDestination = data.id_buyer
        }

        await db.sendMessage(data.id_chat, data.id_book, data.id_seller, data.id_buyer, idDestination, content)
        // enviamos mail de notificación al destinatario:
        const destination = await db.getUserById(idDestination)
        const book = await db.getBook(data.id_book)
        //utils.sendMessageReceivedMail(destination.email, book.title, `http://${process.env.FRONTEND_DOMAIN}/login`)

    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }

    res.send()
}

const deleteMessage = async (req, res) => {
    const decodedToken = req.auth
    const { id } = req.params
    try {
        const message = await db.getMessageById(id)

        if (decodedToken.id === message.id_seller) {
            await db.deleteMessageAsSeller(id)
        } else if (decodedToken.id === message.id_buyer) {
            await db.deleteMessageAsBuyer(id)
        }

        res.send()
        return
    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }
}

const deleteChat = async (req, res) => {
    const decodedToken = req.auth
    const { id } = req.params
    try {
        const sellerBuyer = await db.getSellerAndBuyerOfChat(id)
        if (decodedToken.id === sellerBuyer.id_seller) {
            await db.deleteChatAsSeller(id, decodedToken.id)
        } else if (decodedToken.id === sellerBuyer.id_buyer) {
            await db.deleteChatAsBuyer(id, decodedToken.id)
        }

        res.send()
        return
    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }
}


module.exports = {
    deleteChat,
    deleteMessage,
    getChatMessages,
    getListOfChats,
    sendInitialMessage,
    sendReplyMessage
}