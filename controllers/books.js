const db = require('../db/mysql')
const utils = require('../utils/utils')

const uuid = require('uuid');
const randomstring = require("randomstring");

const fsPromises = require('fs').promises

const { bookValidator } = require('../validators/book')

const uploadBook = async (req, res) => {
    const { isbn, title, course, editorial, editionYear, price, detail } = req.body
    const decodedToken = req.auth

    try {
        // await bookValidator.validateAsync(req.body)

        const activationCode = randomstring.generate(40);

        const { id } = await db.uploadBook(isbn, title, course, editorial, editionYear, price, detail, activationCode, decodedToken.id)

        let items = []
        let exist = false
        if (req.files && req.files.images.length) {
            items = req.files.images.slice(0, 3)
            exist = true
        } else if (req.files) {
            items.push(req.files.images)
            exist = true
        }

        if (exist) {

            await fsPromises.mkdir(`${process.env.TARGET_FOLDER}/books`, { recursive: true })
            // si hiciese falta comprobar la extensión del fichero
            // podríamos hacerlo aquí a partir de la información de req.files
            // y enviar un error si no es el tipo que nos interesa (res.status(400).send())
            for (let i = 0; i < items.length; i++) {
                //SUBIMOS CADA FOTO DEL BUCLE
                try {
                    const fileID = uuid.v4()
                    const outputFileName = `${process.env.TARGET_FOLDER}/books/${fileID}.jpg`

                    await fsPromises.writeFile(outputFileName, items[i].data)

                    await db.uploadImage(outputFileName, id)

                    if (i === 0) {
                        await db.setLastImageAsMain()
                    }

                } catch (error) {
                    res.status(401).send({ error: 'Libro no subido' })
                    return
                }
            }
        }
        //utils.sendReqAuthorizationMail(isbn, title, course, editorial, editionYear, price, detail, `http://${process.env.BACKEND_DOMAIN}/upload/activate/${activationCode}`)

    } catch (e) {
        let statusCode = 400;
        // averiguar el tipo de error para enviar un código u otro
        if (e.message === 'database-error') {
            statusCode = 500
        }

        res.status(statusCode).send(e.message)
        return
    }

    res.send('Libro subido correctamente')
}

const goToActivateBook = async (req, res) => {
    // http://ip:puerto/upload/activate/lkj414j234lkj23142134lk2j34lñk2j42334
    const { code } = req.params;

    try {
        const book = await db.checkBookActivationCode(code)
        if (book) {
            await db.activateBook(book.id)
            const user = await db.getUserById(book.id_user)
            utils.sendConfirmationUploadedMail(user.email, book.isbn, book.title, `http://${process.env.FRONTEND_DOMAIN}/login`)
        } else {
            res.status(400).send({ error: 'El código de activación es incorrecto' })
            return
        }
        // comprobamos posibles peticiones de usuarios de ese isbn
        const requests = await db.checkRequests(book.isbn)

        if (requests.length > 0) {
            const actives = requests.filter(user => user.active)
            for (let user of actives) {
                utils.sendPetitionRequiredMail(user.email, book.isbn, book.title, `http://${process.env.FRONTEND_DOMAIN}/login`)
            }
        }

        res.send('Validado correctamente')
    } catch (e) {
        res.status(401).send({ error: 'Libro no validado' })
    }
}

const updateBook = async (req, res) => {
    const { id } = req.params
    const { isbn, title, course, editorial, editionYear, price, detail, image0, image1, image2, oldImage0, oldImage1, oldImage2 } = req.body
    const decodedToken = req.auth

    try {
        // await bookValidator.validateAsync(req.body)

        const book = await db.getBook(id)

        if (decodedToken.id !== book.id_user) {
            res.status(400).send({ error: 'Usuario no autorizado' })
            return
        }

        if (!book.available) {
            res.status(400).send({ error: 'Operación no permitida' })
            return
        }

        await db.updateBook(isbn, title, course, editorial, editionYear, price, detail, id)

        let items = []
        let exist = false
        if (req.files && req.files.images.length) {
            items = req.files.images.slice(0, 3)
            exist = true
        } else if (req.files) {
            items.push(req.files.images)
            exist = true
        }

        if (exist) {

            await fsPromises.mkdir(`${process.env.TARGET_FOLDER}/books`, { recursive: true })
            // si hiciese falta comprobar la extensión del fichero
            // podríamos hacerlo aquí a partir de la información de req.files
            // y enviar un error si no es el tipo que nos interesa (res.status(400).send())

            let images = [image0, image1, image2]
            let oldimages = [oldImage0 ? oldImage0 : '', oldImage1 ? oldImage1 : '', oldImage2 ? oldImage2 : '']

            let j = 0
            for (let i = 0; i < images.length; i++) {
                if (images[i] === 'changed') {
                    const fileID = uuid.v4()
                    const outputFileName = `${process.env.TARGET_FOLDER}/books/${fileID}.jpg`
                    await fsPromises.writeFile(outputFileName, items[j].data)
                    await db.uploadImage(outputFileName, id)
                    j = j + 1
                    if (oldimages[i]) {
                        const uuid_image = `${process.env.TARGET_FOLDER}/books/${oldimages[i].slice(29)}`
                        await db.deleteImageBook(uuid_image)
                        await fsPromises.unlink(uuid_image)
                    }
                }
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

    res.send('Datos actualizados correctamente')
}

const deleteImageBook = async (req, res) => {
    const { id } = req.params
    const { image } = req.body
    const decodedToken = req.auth

    try {
        let book = {}
        if (image) book = await db.getBook(id)
        else {
            res.status(400).send({ error: 'Error en la petición' })
            return
        }
        if (!book) res.status(400).send({ error: 'Error en la petición' })
        if ((book && decodedToken.id !== book.id_user) || (book && !book.available)) {
            res.status(400).send({ error: 'Usuario no autorizado' })
            return
        }

        const uuid_image = `${process.env.TARGET_FOLDER}/books/${image.slice(29)}`

        const imageToDelete = await db.getImageByUuid(uuid_image)

        if (imageToDelete.id_book === book.id) {
            await db.deleteImageBook(uuid_image)
            await fsPromises.unlink(uuid_image)
        } else {
            res.status(400).send({ error: 'Error en la petición' })
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
    res.send('Imagen borrada correctamente')
}

const getListOfBooksOfUser = async (req, res) => {
    const decodedToken = req.auth

    try {
        const books = await db.getBooksOfUser(decodedToken.id)
        if (books.length === 0) {
            res.send('No tienes libros subidos')
            return
        }

        let booksToSend = []

        for (let book of books) {
            const book_images = await db.getBookImages(book.id)
            let route_image
            if (book_images && book_images.length > 0) route_image = `http://localhost:9999/images/${book_images[0].uuid.slice(13)}`
            else route_image = ''
            const data = { ...book, image: route_image }
            booksToSend.push(data)
        }

        res.send(booksToSend)
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

const getPetitions = async (req, res) => {
    const decodedToken = req.auth

    try {
        const petitions = await db.getPetitionsOfUser(decodedToken.id)
        if (petitions.length !== 0) {
            res.send(petitions)
            return
        } else {
            res.send('No tienes peticiones')
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

const setPetition = async (req, res) => {
    const decodedToken = req.auth
    const { isbn, petIndex } = req.body

    try {
        await db.setPetitionOfUser(decodedToken.id, isbn, petIndex)

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
    return
}

const searchByLevel = async (req, res) => {
    const { level } = req.params

    try {
        const books = await db.searchBooksByLevel(level)

        res.send(books)
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

const getBookInfo = async (req, res) => {
    const { id } = req.params

    try {
        const book = await db.getBook(id)
        if (!book) {
            res.status(404).send({ error: 'No se encuentran los datos' })
            return
        } else if (book.available === false) {
            res.status(400).send({ error: 'No se encuentran los datos' })
            return
        }
        const book_images = await db.getBookImages(id)
        const images = []

        if (book_images && book_images.length > 0) {
            let route
            for (let image of book_images) {
                route = `http://localhost:9999/images/${image.uuid.slice(13)}`
                images.push(route)
            }
        }

        const seller = await db.getUserById(book.id_user)

        let rating
        if (seller.ratings !== null) {
            rating = seller.ratings
            let decimales
            let unidades
            let numero = `${rating}`.split('.')
            unidades = parseInt(numero[0])
            if (parseInt(numero[1]) < 25) decimales = 0
            else if (parseInt(numero[1]) < 75) decimales = 5
            else unidades = unidades > 4 ? unidades : unidades + 1
            rating = parseFloat(`${unidades}.${decimales}`)
        }

        const data = {
            'id': id,
            'id_seller': seller.id,
            'seller_name': seller.name,
            'title': book.title,
            'course': book.course,
            'isbn': book.isbn,
            'editorial': book.editorial,
            'editionYear': book.editionYear,
            'location': seller.location,
            'price': book.price,
            'detail': book.detail,
            'available': book.available,
            'images': images,
            'ratings': seller.ratings,
            'stars_rating': rating
        }

        res.send(data)
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

const deleteBook = async (req, res) => {
    const { id } = req.params
    const decodedToken = req.auth

    try {
        const book = await db.getBook(id)

        if (decodedToken.id !== book.id_user) {
            res.status(400).send({ error: 'Operación no permitida' })
            return
        } else {
            await db.deleteBook(id)
        }

        let cancelled = await db.getTransactionsToCancel(id)

        if (cancelled) {
            for (let item of cancelled) {
                let buyer = await db.getUserById(item.id_buyer)
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

    res.send('Libro borrado correctamente')
}

module.exports = {
    deleteBook,
    deleteImageBook,
    getListOfBooksOfUser,
    getPetitions,
    getBookInfo,
    goToActivateBook,
    searchByLevel,
    setPetition,
    updateBook,
    uploadBook,
}