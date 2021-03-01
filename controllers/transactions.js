const db = require('../db/mysql')
const utils = require('../utils/utils')
const moment = require('moment')

const { transferValidator } = require('../validators/transfer')

const createTransaction = async (req, res) => {
    const { id } = req.params;
    const decodedToken = req.auth

    try {
        const book = await db.getBook(id)

        // Verificamos que el usuario que realiza la 
        // transaccion no es el propio vendedor
        if (decodedToken.id === book.id_user) {
            // res.status(401).send()
            res.send('Operación no permitida. Ya eres el propietario del libro')
            return
        }
        if (!book.available) {
            res.status(401).send()
            return
        }
        // obtenemos los datos del vendedor
        const seller = await db.getUserById(book.id_user)

        // creamos la transacción (donde: se completa 
        // la transacción actual y se cancelan las demás
        // asociadas al libro si las hubiese, y se pasa
        // el estado del libro a 'no disponible')
        if (seller.active) {
            await db.createTransaction(id, decodedToken.id)
        } else {
            res.status(401).send()
            return
        }

        // enviamos un email informativo a vendedor
        // y comprador
        //utils.sendBookingMail(seller.email, decodedToken.email, book.title, book.course, `http://${process.env.FRONTEND_DOMAIN}/login`)

    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }

    res.send('Petición realizada correctamente')
}

const confirmTransaction = async (req, res) => {
    const { id } = req.params;
    const { place, date } = req.body
    const decodedToken = req.auth

    try {
        // const newDate = moment(date).format('YYYY-MM-DDThh:mm:ss.sssZ')
        const newDate = `${date}:00.000Z`
        console.log(newDate)
        // antes de actualizar con lugar y fecha de entrega se valida que éstos vayan en el formato correcto
        // con un validator
        // await transferValidator.validateAsync(req.auth)

        const transaction = await db.getTransaction(id)
        const book = await db.getBook(transaction.id_book)
        let buyer = await db.getUserById(transaction.id_buyer)
        console.log(transaction)
        // Verificamos que el usuario que confirma
        // la transaccion es el propio vendedor
        if (decodedToken.id !== book.id_user) {
            res.status(400).send()
            return
        }
        if (!buyer.active) {
            res.status(400).send()
            return
        }

        // se completa la transacción actual y 
        // se cancelan las demás asociadas al
        // libro si las hubiese, enviando emails
        // informativos, y se pasa el estado 
        // del libro a 'no disponible'
        const placeToSend = `"${place}"`
        const dateToSend = `"${newDate.slice(0, 10)} ${newDate.slice(11, 19)}"`
        await db.completeTransaction(placeToSend, dateToSend, id)
        //utils.sendCompletedTransactionMail(decodedToken.email, buyer.email, book.title, book.course, place, date, `http://${process.env.FRONTEND_DOMAIN}/login`)
        await db.deleteBook(transaction.id_book)

        let cancelled = await db.getTransactionsToCancel(book.id)

        if (cancelled) {
            for (let item of cancelled) {
                buyer = await db.getUserById(item.id_buyer)
                await db.cancelTransaction(item.id)
                // utils.sendCanceledTransactionMail(decodedToken.email, buyer.email, book.title, book.course, id, `http://${process.env.FRONTEND_DOMAIN}/login`)
            }
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

    res.send('Transacción realizada correctamente')
}

const cancelTransaction = async (req, res) => {
    const { id } = req.params;
    const decodedToken = req.auth

    try {
        const transaction = await db.getTransaction(id)
        const book = await db.getBook(transaction.id_book)
        const buyer = await db.getUserById(transaction.id_buyer)

        if (transaction.status !== 'en proceso') {
            res.status(400).send({ error: 'Error en la petición' })
            return
        }
        // Verificamos que el usuario que cancela
        // la transaccion es el vendedor o el comprador
        if (decodedToken.id !== book.id_user && decodedToken.id !== transaction.id_buyer) {
            res.status(400).send()
            return
        }
        await db.cancelTransaction(id)
        //utils.sendCanceledTransactionMail(decodedToken.email, buyer.email, book.title, book.course, id, `http://${process.env.FRONTEND_DOMAIN}/login`)
    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }

    res.send('Transacción cancelada con éxito')
}

const getListOfTransactions = async (req, res) => {
    const decodedToken = req.auth

    try {
        const transactions = await db.getListOfTransactionsOfUser(decodedToken.id)

        let transactionsToSend = []
        if (transactions.length !== 0) {
            for (let transaction of transactions) {
                const book = await db.getBook(transaction.id_book)
                const seller = await db.getSellerByIdBook(transaction.id_book)
                const buyer = await db.getUserById(transaction.id_buyer)
                let dato
                let review_date
                if (transaction.transfer_date) {
                    dato = `${transaction.transfer_date.toISOString().slice(0, 10)} a las ${transaction.transfer_date.toISOString().slice(11, 16)}`
                    review_date = transaction.transfer_date.setDate(transaction.transfer_date.getDate() + 1)
                } else {
                    dato = transaction.transfer_date
                    review_date = transaction.transfer_date
                }

                const input = {
                    'id': transaction.id,
                    'review': transaction.review,
                    'status': transaction.status,
                    'transfer_place': transaction.transfer_place,
                    'transfer_date': dato,
                    review_date,
                    'book_title': book.title,
                    'book_isbn': book.isbn,
                    'book_course': book.course,
                    'book_editorial': book.editorial,
                    'book_price': book.price,
                    'seller_id': seller.id,
                    'seller_name': seller.name,
                    'seller_surnames': seller.surnames,
                    'buyer_id': buyer.id,
                    'buyer_name': buyer.name,
                    'buyer_surnames': buyer.surnames
                }
                transactionsToSend.push(input)
            }
        }
        res.send(transactionsToSend)
        console.log(transactionsToSend)

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

const getListOfPurchases = async (req, res) => {
    const decodedToken = req.auth
    try {
        const transactions = await db.getListOfTransactionsOfUser(decodedToken.id)
        let purchases = []

        if (transactions) {
            purchases = transactions.filter(transaction => transaction.id_buyer === decodedToken.id)
            res.send(purchases)
            return
        } else {
            res.send('Aún no has realizado ninguna compra')
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

const getListOfSales = async (req, res) => {
    const decodedToken = req.auth
    try {
        const transactions = await db.getListOfTransactionsOfUser(decodedToken.id)

        if (transactions) {
            const sales = transactions.filter(transaction => transaction.id_buyer !== decodedToken.id)
            res.send(sales)
        } else {
            res.send('Aún no tienes transacciones de venta')
            return
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

const getUserReviews = async (req, res) => {
    const decodedToken = req.auth
    try {
        const transactions = await db.getListOfTransactionsOfUser(decodedToken.id)

        if (transactions) {
            const reviews = transactions
                .filter((transaction) => (transaction.id_buyer !== decodedToken.id) && (transaction.status === 'completado'))
                .map(transaction => {
                    let review = {
                        id: transaction.id,
                        id_book: transaction.id_book,
                        id_buyer: transaction.id_buyer,
                        review: transaction.review
                    }
                    return review
                })

            res.send(reviews)
            return
        } else {
            res.send('Aún no tienes transacciones de venta')
            return
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

const putReviewToSeller = async (req, res) => {
    const { id } = req.params;
    const { review } = req.body
    const decodedToken = req.auth

    try {
        const transaction = await db.getTransaction(id)

        if (!transaction || transaction.id_buyer !== decodedToken.id) {
            res.status(400).send({ error: 'Error en la petición' })
            return
        }

        await db.updateTransactionWithReview(review, id)

        const seller = await db.getSellerByIdBook(transaction.id_book)
        const listOfreviews = await db.getReviewsOfUser(seller.id)
        let average = 0
        if (listOfreviews.length > 0) {
            let sumaReviews = 0
            for (let item of listOfreviews) {
                sumaReviews = sumaReviews + item.review
            }
            average = (sumaReviews / listOfreviews.length).toFixed(1)
        } else {
            res.status(400).send({ error: 'Error en la petición' })
            return
        }

        await db.updateSellerReview(average, seller.id)
        
    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }
    res.send('Valoración enviada con éxito')
}


module.exports = {
    cancelTransaction,
    confirmTransaction,
    createTransaction,
    getListOfPurchases,
    getListOfSales,
    getListOfTransactions,
    getUserReviews,
    putReviewToSeller
}