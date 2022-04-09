const express = require('express')
const { Kdecole, ApiUrl, ApiVersion } = require('kdecole-api')
require('dotenv').config()
const app = express()


app.set('view engine', 'ejs');
app.use(express.json())


app.use('/api', async (req, res, next) => {
    const {token, ent, idEtablissement, idEleve} = req.body
    if(!token) return next()
    try {
        const user = new Kdecole(token, ApiVersion[ent], idEtablissement, ApiUrl[ent])
        await user.starting()
        res.locals = { user, idEleve }
        next()
    } catch(e) {
        return res.status(401).type('application/json').send({ok: false})
    }
})

app.post('/api', async (_req, res) => {
    /** @type {{user: Kdecole}} */
    const {user} = res.locals
    const infoUtilisateur = await user.getInfoUtilisateur()

    const eleves = infoUtilisateur.eleves.map(e => ({active: e.active, nom: e.nom, uid: e.uid}))
    res.type('application/json').send({ok: true, eleves, nom: infoUtilisateur.nom})
})


app.get('/', (_req, res) => res.render('pages/index', {
        entList: Object.keys(ApiUrl).filter(x => Object.keys(ApiVersion).includes(x)).map(x => x.replace(/PROD_/g, '').replace(/_/g, ' '))
}))

app.post('/api/activation', async (req, res) => {
    const {username, tempPassword, ent} = req.body
    try {
        res.type('application/json').send({ok: true, token: await Kdecole.login(username, tempPassword, ApiVersion[ent], ApiUrl[ent])})
    } catch(e) {
        res.status(401).type('application/json').send({ok: false})
    }
})

app.post('/api/revoke', async (_req, res) => {
    /** @type {{user: Kdecole}} */
    const {user} = res.locals
    try {
        await user.logout()
        res.type('application/json').send({ok: true})
    } catch(e) {
        res.type('application/json').send({ok: false})
    }
})

app.post('/api/calendar', async (req, res) => {
    /** @type {{user: Kdecole, idEleve: string}} */
    const {user, idEleve} = res.locals
    const calendar = await user.getCalendrier(idEleve)

    if(req.accepts('text/calendar')) res.type('text/calendar').send(calendar.toICalendar(parseInt(req.body.weeks ?? '2')))
    else res.type('application/json').send(calendar.listeJourCdt)
})


app.post('/api/releve/:target(devoirs|matieres|trimestres)?', async (req, res) => {
    /** @type {{user: Kdecole, idEleve: string}} */
    const {user, idEleve} = res.locals
    const releve = await user.getReleve(idEleve)
    const {target} = req.params
    if(req.accepts('text/csv') && target !== undefined) res.type('text/csv').send(releve.toCSV()[target])
    else res.type('application/json').send(releve.trimestres)
})

app.post('/api/taf', async (req, res) => {
    /** @type {{user: Kdecole, idEleve: string}} */
    const {user, idEleve} = res.locals
    const {listeTravaux, tafOuvert} = await user.getTravailAFaire(idEleve, new Date(req.body.notBefore ?? Date.now()))
    if(!tafOuvert) return res.send({ok: false})
    if(req.accepts('text/csv')) {
        const travaux = (await Promise.all(listeTravaux
        .map(j => j.listTravail
            .map(async t => ({
                ...t,
                pourLe: j.date,
                codeHTML: (await user.getContenuActivite(t.uidSeance, t.uid, idEleve)).codeHTML.replace(/<[^>]+>/g, '').replace(/"/g, '""').replace(/\n/g, '')})))
        .flat()))
        .sort((t1, t2) => t1.pourLe.getTime() < t2.pourLe.getTime())
        const CSV_HEADER = `Fait,Pour Le,Donné le,Matière,Type,Details\n`;
        res.type('text/csv').send(CSV_HEADER + travaux.map(t => `${t.flagRealise ? 'oui' : 'non'},"${t.pourLe.toLocaleDateString()}",${t.date.toLocaleDateString()},${t.matiere},"${t.type}","${t.codeHTML}"`).join('\n'))
    } else res.type('application/json').send(listeTravaux)
})

app.post('/api/absences', async (req, res) => {
    /** @type {{user: Kdecole, idEleve: string}} */
    const {user, idEleve} = res.locals
    const absences = await user.getAbsences(idEleve)

    if(req.accepts('text/csv')) {
        const CSV_HEADER = 'Date début,Date fin,Justifiée,Type,Motif\n'
        res.type('text/csv').send(CSV_HEADER + absences.listeAbsences.map(a => `${a.dateDebut.toISOString()},${a.dateFin.toISOString()},${a.justifiee ? 'oui' : 'non'},${a.type},${a.motif}`).join('\n'))
    } else res.type('application/json').send(JSON.stringify(absences.listeAbsences))
})

app.listen(parseInt(process.env.HTTP_PORT ?? '8080'))
