const { reject } = require("bluebird")

const sqlite3 = require("sqlite3").verbose()

//this was ported from the previous contest bot, it was originally in python

class Database{
    constructor(database_file){
        this.database_file = database_file
        this.conn = new sqlite3.Database(database_file)
        this.conn.run("PRAGMA foreign_keys = 1")
        this.default_elo = 1400
        const c = this.conn

        c.run(`CREATE TABLE IF NOT EXISTS player(
            player_id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            truename TEXT UNIQUE NOT NULL
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS message(
            message_id INTEGER PRIMARY KEY,
            player_id INTEGER,
            time TEXT,
            content TEXT,
            FOREIGN KEY(player_id) REFERENCES player(player_id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS banned(
            player_id INTEGER PRIMARY KEY,
            banner_id INTEGER NOT NULL,
            time TEXT,
            reason TEXT,
            FOREIGN KEY(player_id) REFERENCES player(player_id),
            FOREIGN KEY(banner_id) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS level(
            player_id INTEGER PRIMARY KEY,
            level INTEGER NOT NULL,
            FOREIGN KEY(player_id) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS avatar(
            player_id INTEGER PRIMARY KEY,
            avatar TEXT NOT NULL,
            FOREIGN KEY(player_id) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS elo(
            player_id INTEGER PRIMARY KEY,
            rating INTEGER NOT NULL,
            FOREIGN KEY(player_id) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS administrator(
            player_id INTEGER PRIMARY KEY,
            source INTEGER,
            FOREIGN KEY(player_id) REFERENCES player(player_id),
            FOREIGN KEY(source) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS moderator(
            player_id INTEGER PRIMARY KEY,
            source INTEGER,
            FOREIGN KEY(player_id) REFERENCES player(player_id),
            FOREIGN KEY(source) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS valour(
            player_id INTEGER PRIMARY KEY,
            surplus INTEGER NOT NULL,
            referer_id INTEGER,
            FOREIGN KEY(player_id) REFERENCES player(player_id),
            FOREIGN KEY(referer_id) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS game(
            game_id INTEGER PRIMARY KEY,
            song_count INTEGER,
            player_count INTEGER,
            time TEXT
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS gameplayer(
            game_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            result INTEGER NOT NULL,
            miss_count INTEGER NOT NULL,
            position INTEGER NOT NULL,
            correct_time INTEGER,
            miss_time INTEGER,
            PRIMARY KEY(game_id, player_id),
            FOREIGN KEY(game_id) REFERENCES game(game_id),
            FOREIGN KEY(player_id) REFERENCES player(player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS gameplayerdeleted(
            game_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            result INTEGER NOT NULL,
            miss_count INTEGER NOT NULL,
            position INTEGER NOT NULL,
            correct_time INTEGER,
            miss_time INTEGER,
            admin_id INTEGER NOT NULL,
            removal_time TEXT NOT NULL,
            PRIMARY KEY(game_id, player_id, admin_id, removal_time), /*It is highly unlikely that two administrators delete at the same time, but could happen*/
            FOREIGN KEY(game_id) REFERENCES game(game_id),
            FOREIGN KEY(player_id) REFERENCES player(player_id),
            FOREIGN KEY(admin_id) REFERENCES player(player_id) /*could reference administrator, but that would cause problems if the administrator is removed*/
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS gameplayeranswer(
            game_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            ordinal INTEGER NOT NULL,
            correct INTEGER NOT NULL,
            answer_time INTEGER,
            answer TEXT,
            PRIMARY KEY(game_id, player_id, ordinal),
            FOREIGN KEY(game_id, player_id) REFERENCES gameplayer(game_id, player_id),
            CHECK (correct=0 OR correct=1)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS elodiff(
            game_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            rating_change INTEGER NOT NULL,
            PRIMARY KEY(game_id, player_id),
            FOREIGN KEY(game_id, player_id) REFERENCES gameplayer(game_id, player_id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS song(
            song_id INTEGER PRIMARY KEY,
            anime TEXT,
            type TEXT,
            title TEXT,
            artist TEXT,
            link TEXT
        );`)
        c.run(`CREATE VIEW IF NOT EXISTS valour_record AS
            WITH RECURSIVE record (level, player_id, referer_id) AS
                (SELECT 0, v.player_id AS player_id, v.referer_id AS referer_id
                    FROM valour v
                        WHERE v.referer_id IS NULL
                UNION ALL
                SELECT r.level+1, v.player_id, v.referer_id
                    FROM record AS r
                        JOIN valour v
                            ON r.player_id = v.referer_id
                )
            
            SELECT level, player_id, referer_id from record
        ;`)
        
        
        this.conn.run(`INSERT INTO player (player_id, username, truename) VALUES(
            0,
            '<system>',
            '<System>'
        );`, [], this.dud)
        this.conn.run(`INSERT INTO administrator (player_id, source) VALUES(
            0,
            NULL
            );`, [], this.dud)
        this.conn.run(`INSERT INTO moderator (player_id, source) VALUES(
            0,
            NULL
            );`, [], this.dud)
    }

    destroy = () => {
        this.conn.close()
    }

    run(command, parameters = []){
        return new Promise((resolve, reject) => {
            function callback(err){
                if(err) reject(err)
                else resolve({ lastID: this.lastID, changes: this.changes })
            }
            this.database.run(command, parameters, callback)
        })
    }

    get(command, parameters = []){
        return new Promise((resolve, reject) => {
            function callback(err, row){
                if(err) reject(err)
                else resolve(row)
            }
            this.database.get(command, parameters, callback)
        })
    }
    
    all(command, parameters = []){
        return new Promise((resolve, reject) => {
            function callback(err, rows){
                if(err) reject(err)
                else resolve(rows)
            }
            this.database.all(command, parameters, callback)
        })
    }

    async create_player(username){
        //this also doubles as the get_or_create, but it is fundamentally slower 
        //due to the guaranteed fail on insert of existing person
        if(typeof username !== "string"){
            throw "create_player: username must be string"
        }
        try{
            await this.run(`INSERT INTO player (username, truename) VALUES(
            (?),
            ?
            )`, [username.toLowerCase(), username])
        }finally{
            return this.get_player_id(username)
        }
    }

    async change_name(old_name, new_name){
        if(typeof old_name !== "string" || typeof new_name !== "string"){
            throw "change_name: all parametres must be strings"
        }
        old_name = old_name.toLowerCase()
        const new_username = new_name.toLowerCase()
        return this.run(`
            UPDATE player
            SET username = ?,
            truename = ?
            WHERE username = ?
        `, [new_username, new_name, old_name])
    }

    async get_player_id(username){
        if(typeof username !== "string"){
            throw "get_player_id: username must be string"
        }
        const row = await this.get(`SELECT player_id FROM player WHERE username=(?)`, [username.toLowerCase()])
        return row?.player_id ?? null
    }

    async get_player_id_strict(username){
        const player_id = await this.get_player_id(username)
        if(player_id === null){
            throw Error(`get_player_id_strict: ${username} is not a known player.`)
        }
        return player_id
    }

    async get_or_create_player_id(username){
        const player_id = await this.get_player_id(username)
        if(player_id){
            return player_id
        }else{
            return this.create_player(username)
        }
    }

    async get_player_username(player_id){
        const row = await this.get(`SELECT username FROM player WHERE player_id=(?)`, [player_id])
        return row?.username ?? null
    }

    async get_player_truename(player_id){
        const row = await this.get(`SELECT truename FROM player WHERE player_id=(?)`, [player_id])
        return row?.truename ?? null
    }

    async get_player(username){
        const player_id = await this.get_player_id(username)
        if(!player_id){
            resolve({player_id:null, level:null, avatar:null, banned:null})
        }
        const banned = await this.is_banned(username)
        const avatar = await this.get_player_avatar(player_id)
        const level = await this.get_player_level(player_id)
        return {player_id, banned, level, avatar}
    }

    async get_player_level(player_id){
        const row = await this.get(`SELECT level FROM level WHERE player_id=(?)`, [player_id])
        return row?.level ?? null
    }

    async update_player_level(player_id, new_level){
        //creates or updates, but since in SQL null is a valid value I call the function update
        try{
            return await this.run("INSERT INTO level (player_id, level) VALUES(?,?)", [player_id, new_level])
        }catch{ //the error value is not used
            return this.run("UPDATE level SET level = ? WHERE player_id = ?", [new_level, player_id])
        }
    }
        

    async get_player_avatar(player_id){
        const row = await this.get(`SELECT avatar FROM avatar WHERE player_id=(?)`, [player_id])
        return row?.avatar ? JSON.parse(row.avatar) : null
    }

    async update_player_avatar(player_id, new_avatar){
        new_avatar = JSON.stringify(new_avatar)
        try{
            return await this.run("INSERT INTO avatar (player_id, avatar) VALUES(?,?)", [player_id, new_avatar])
        }catch{
            return this.run("UPDATE avatar SET avatar = ? WHERE player_id = ?", [new_avatar, player_id])
        }
    }

    async save_message(username, message){
        const player_id = await this.get_or_create_player_id(username) //get_or_create to make sure all messages are saved, even if the player somehow isn't registered yet
        return this.run(`
            INSERT INTO message (player_id, time, content) VALUES(
            (?),
            DATETIME('now'),
            (?)
        )`, [player_id, message])
    }

    async ban_player(username, reason=null, banner=null){
        const player_id = await this.get_or_create_player_id(username)
        const banner_id = banner ? await this.get_or_create_player_id(banner) : 0
        return this.run(`
            INSERT INTO banned (player_id, reason, banner_id, time) VALUES(
            (?),
            (?),
            (?),
            DATETIME('now')
        )`, [player_id, reason, banner_id])
    }

    async unban_player(username){
        if (typeof username !== "string"){
            throw "unban_player: username has to be string"
        }
        return this.run(`
            DELETE FROM banned
            WHERE player_id = (SELECT player_id FROM player where username = ?)
        `, [username.toLowerCase()])
    }

    async is_banned(username){
        if (typeof username !== "string"){
            throw "is_banned: username has to be string"
        }
        const row = await this.get(`
            SELECT player_id FROM banned
            NATURAL JOIN player
            WHERE username = ?
        `, [username.toLowerCase()])
        return Boolean(row)
    }

    async ban_readable($username=null, $banner=null){
        let query = `
        SELECT p.username as player_username, reason, p2.username as banner_username, time
        FROM banned AS b
        NATURAL JOIN player AS p
        JOIN player AS p2
            ON p2.player_id = b.banner
        `
        if ($username){
            if ($banner){
                query += "WHERE p.username = $username AND p2.username = $banner;"
            } else{
                query += "WHERE p.username = $username;"
            }
        }else if ($banner){
            query += "WHERE p2.username = $banner;"
        }
        return this.all(query, {$username, $banner})
    }

    async add_administrator(username, source=null){
        const player_id = await this.get_or_create_player_id(username)
        const source_id = source === null ? 0 : await this.get_player_id(source)
        return this.run(`INSERT INTO administrator (player_id, source) VALUES(
            ?,
            ?
            )`, [player_id, source_id])
    }

    async remove_administrator(username){
        if (typeof username !== "string"){
            throw "remove_administrator: username has to be string"
        }
        return this.run(`
        DELETE FROM administrator
        WHERE player_id = (SELECT player_id FROM player where username = ?)
        `, [username.toLowerCase()])
    }

    async is_administrator(username){
        if (typeof username !== "string"){
            throw "is_administrator: username has to be string"
        }
        const row = await this.get(` 
        SELECT *
        FROM administrator
        NATURAL JOIN player
        WHERE username = ?`, [username.toLowerCase()])
        return Boolean(row)
    }

    add_moderator(username, source=null){
        return new Promise((resolve, reject) =>{ 
            this.get_or_create_player_id(username).then(player_id => {
                this.get_player_id(source).then(source_id => {
                    source_id = source_id || 0
                    const success = (err) => {
                        if (err) reject(err)  // this probably means the moderator already exists
                        else resolve()
                    }
                    this.conn.run(`INSERT INTO moderator (player_id, source) VALUES(
                        ?,
                        ?
                        )`, [player_id, source_id], success)
                })
            })
        
        })
    }

    remove_moderator(username){
        return new Promise((resolve, reject) =>{ 
            if (typeof username !== "string"){
                reject("remove_moderator: username has to be string")
                return
            }
            const success = (err) => {
                if (err) reject(err)
                else resolve()
            }
            this.conn.run(`DELETE FROM moderator
            WHERE player_id = (SELECT player_id FROM player where username = ?)`, [username.toLowerCase()], success)
        })
    }

    is_moderator(username){
        return new Promise((resolve, reject) =>{
            if (typeof username !== "string"){
                reject("is_moderator: username has to be string")
                return
            } 
            const success = (err, row) => {
                if (err) reject(err)
                else {
                    if(!!row){
                        resolve(true)
                    }else{
                        this.is_administrator(username).then(result => { resolve(result) }).catch(err => { reject(err) })
                    }
                }
            }
            this.conn.get(` 
            SELECT *
            FROM moderator
            NATURAL JOIN player
            WHERE username = ?`, [username.toLowerCase()], success)
        })
    }

    async add_valour(username, referer=null){
        //valour is a joke I added to hone my skills on recursive database calls
        const surplus = referer === null ? 999 : await this.get_valour_surplus(referer)
        if(surplus <= 0){
            throw Error("not enough surplus")
        }
        const player_id = await this.get_player_id_strict(username)
        const player_has_valour = await this.has_valour(username)
        const player_parent = player_has_valour? await this.get_valour_parent(username) : null
        const player_level = await this.get_valour_level(username)
        const referer_level = referer === null ? 0 : await this.get_valour_level(referer)
        if(player_level - 1 <= referer_level){
            throw Error(`${username}'s valour rank will not increase`)
        }
        const default_surplus = Math.floor(referer_level * 0.5) + 2
        const referer_id = referer === null ? null : await this.get_player_id_strict(referer)
        return new Promise((resolve, reject) =>{
            const success = async (err) => {
                if(err){
                    reject(err)
                }else{
                    resolve(referer === null ? true : await this.change_valour_surplus(referer, -1))
                }
            }
            if(player_has_valour){
                this.conn.run(`UPDATE valour SET referer_id = $referer_id WHERE player_id = $player_id
                    `, {$player_id: player_id, $referer_id: referer_id}, async (err) => {
                        if(err) reject(err)
                        else {
                            await this.change_valour_surplus(player_parent, 1)
                            resolve(referer === null ? true : await this.change_valour_surplus(referer, -1))
                        }
                    })
            }else{
                this.conn.run(`INSERT INTO valour (player_id, surplus, referer_id) VALUES(
                    ?,
                    ?,
                    ?
                    )`, [player_id, default_surplus, referer_id], success)
            }
        })
    }

    async get_valour_parent(username){
        const player_id = await this.get_player_id_strict(username)
        if(!await this.has_valour(username)){
            throw Error(`${username} has no valour and thus has no parent`)
        }
        if(await this.get_valour_level(username) === 0){
            return null
        }
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if(err) reject(err)
                else resolve(row.truename)
            }
            this.conn.get(`
                SELECT p.truename
                FROM valour AS v
                INNER JOIN player AS p
                    ON v.referer_id = p.player_id 
                WHERE v.player_id = ?
            `, [player_id], success)
        })
    }
    
    async get_valour_child_count(username){
        const player_id = await this.get_player_id_strict(username)
        if(!await this.has_valour(username)){
            throw Error(`${username} has no valour and thus has no children`)
        }
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if(err) reject(err)
                else resolve(row.count)
            }
            this.conn.get(`
            WITH RECURSIVE record (level, player_id, referer_id) AS
            (SELECT 0, v.player_id AS player_id, v.referer_id AS referer_id
                FROM valour v
                    WHERE v.referer_id = ?
            UNION ALL
            SELECT r.level+1, v.player_id, v.referer_id
                FROM record AS r
                    JOIN valour v
                        ON r.player_id = v.referer_id
            )
        
            SELECT count(*) as count from record
            `, [player_id], success)
        })
    }

    async has_valour(username){
        const player_id = await this.get_player_id(username)
        return new Promise((resolve, reject) =>{
            const success = (err, row) => {
                if(err) reject(err)
                else resolve(Boolean(row))
            }
            this.conn.get(`
                SELECT player_id
                FROM valour
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    async get_valour_level(username){
        const player_id = await this.get_player_id_strict(username)
        return new Promise((resolve, reject) =>{ 
            const success = (err, row) => {
                if(err) reject(err)
                else if (!row) resolve(Number.POSITIVE_INFINITY)
                else resolve(row.level)
            }
            this.conn.get(`
                SELECT level
                FROM valour_record
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    async get_valour_surplus(username){
        const player_id = await this.get_player_id_strict(username)
        if(!await this.has_valour(username)){
            throw Error(`${username} does not have valour`)
        }
        return new Promise((resolve, reject) =>{
            const success = (err, row) => {
                if(err) reject(err)
                else resolve(row.surplus) //if row.surplus does not exist something is horribly wrong
            }
            this.conn.get(`
                SELECT surplus
                FROM valour
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    async change_valour_surplus(username, change){
        const surplus = await this.get_valour_surplus(username)
        if(surplus + change < 0){
            return false
        }
        const new_surplus = surplus + change
        const player_id = await this.get_player_id_strict(username)
        return new Promise((resolve, reject) =>{
            const success = (err) => {
                if (err) reject(err)
                else resolve(true)
            }
            this.conn.run(`
                UPDATE valour
                SET surplus = ?
                WHERE player_id = ?
            `, [new_surplus, player_id], success)
            
        })
    }
        

    valour_readable(){
        return new Promise((resolve, reject) =>{
            const ret = (err, rows) => {
                if(err) reject(err)
                else resolve(rows)
            }
            this.conn.all(`
            SELECT r.level AS level, p.truename AS player_truename, p2.truename AS referer_truename
            FROM valour_record AS r
            NATURAL JOIN player AS p
            LEFT OUTER JOIN player as p2 on p2.player_id = r.referer_id
            ORDER BY level, p.truename, p2.truename`, [], ret)
        })
    }

    get_song_id(song){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.song_id:null)
            }
            this.conn.get(`
            SELECT song_id FROM song
            WHERE
                    anime = ?
                AND
                    type = ?
                AND
                    title = ?
                AND
                    artist = ?
                AND
                    link = ?
            `, [song.anime, song.type, song.name, song.artist, song.link], success)
        })
    }

    get_or_create_song_id(song){
        return new Promise((resolve, reject) => {
            const success = (err) => {
                if(err){
                    reject(err)
                }else{
                    this.get_song_id(song).then(result => { resolve(result) })
                }
            }
            this.get_song_id(song).then(res => {
                if(res){
                    resolve(res)
                }else{
                    this.conn.run(`
                        INSERT INTO song (anime, type, title, artist, link) VALUES(
                        ?,
                        ?,
                        ?,
                        ?,
                        ?)
                    `, [song.anime, song.type, song.name, song.artist, song.link], success)
                }
            })
        })
    }

    create_game(song_count, player_count){
        return new Promise((resolve, reject) => {
            const step3 = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.game_id:null)
            }
            const step2 = (err) => {
                if(err){
                    reject(err)
                }else{
                    this.conn.get(`
                        SELECT game_id FROM game
                        ORDER BY game_id DESC
                        LIMIT 1
                    `, [], step3)
                }
            }
            //step1:
            this.conn.run(`
            INSERT INTO game (song_count, player_count, time) VALUES(
            ?,
            ?,
            DATETIME('now')
            )`, [song_count, player_count], step2)
        })
    }

    add_song_to_game(game_id, song, ordinal){
        return new Promise((resolve, reject) => {
            const success = (err) => {
                if (err) reject(err)
                else resolve()
            }
            this.get_or_create_song_id(song).then(song_id => {
                this.conn.run(`
                INSERT INTO gamesong (game_id, song_id, ordinal) VALUES(
                ?,
                ?,
                ?
                )`, [game_id, song_id, ordinal], success)
            })
            
        })
    }

    get_all_ratings(){
        return new Promise((resolve, reject) => {
            const success = (err, rows) => {
                if (err) reject(err)
                else resolve(rows)
            }
            //this is gameplayer to limit the elo to only those who have actually played a game, 
            //because checking elo autogenerates the default
            this.conn.all(`
                SELECT DISTINCT(player_id), rating
                FROM gameplayer
                NATURAL JOIN elo
                ORDER BY rating DESC
            `, [], success)
        })
    }

    get_total_games(){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.count:0)
            }
            this.conn.get(`
                SELECT count(*) as count FROM game
            `, [], success)
        })
    }

    get_player_game_count(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.count:0)
            }
            this.conn.get(`
                SELECT count(*) as count
                FROM gameplayer
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    get_player_win_count(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.count:0)
            }
            this.conn.get(`
            SELECT count(*) as count 
            FROM gameplayer
            WHERE player_id = ?
            AND position = 1`, [player_id], success)
            
        })
    }

    get_player_hit_count(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.sum:0)
            }
            this.conn.get(`
                SELECT COALESCE(SUM(result),0) as sum 
                FROM gameplayer
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    get_player_miss_count(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.sum:0)
            }
            this.conn.get(`
                SELECT COALESCE(SUM(miss_count),0) as sum 
                FROM gameplayer
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    get_player_song_count(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.sum:0)
            }
            this.conn.get(`
                SELECT COALESCE(SUM(miss_count),0) + COALESCE(SUM(result),0) as sum 
                FROM gameplayer
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    get_player_hit_rate(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if(err) reject(err)
                else{
                    const total = row?row.total:0
                    const hit_count = row?row.hit_count:0
                    resolve((hit_count/total*100).toFixed(2) + "%")
                }
            }
            this.conn.get(`
                SELECT COALESCE(SUM(miss_count),0) + COALESCE(SUM(result),0) as total, COALESCE(SUM(result),0) as hit_count
                FROM gameplayer
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    get_player_hit_miss_ratio(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else{
                    const hit = row?row.hit_count:0
                    const miss = row?row.miss:0
                    let res
                    if(!hit && !miss){
                        res = "0:0"
                    }else if (hit == miss){
                        res = "1:1"
                    }else if (!miss){
                        res = "1:0"
                    }else if (!hit) {
                        res = "0:1"
                    }else if (hit > miss){
                        res = (hit/miss).toFixed(2) + ":1"
                    }else{
                        res = "1:" + (miss/hit).toFixed(2)
                    }
                    resolve(res)
                }
            }
            this.conn.get(`
                SELECT COALESCE(SUM(miss_count),0) as miss, COALESCE(SUM(result),0) as hit_count
                FROM gameplayer
                WHERE player_id = ?
            `, [player_id], success)
        })
        
    }

    get_average_answer_time_correct(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.average:null)
            }
            this.conn.get(`
                SELECT COALESCE(SUM(answer_time),0)/count(*) as average
                FROM gameplayeranswer
                WHERE player_id = ? AND answer_time is not null AND correct = 1
            `, [player_id], success)
        })
    }

    get_average_answer_time_wrong(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.average:null)
            }
            this.conn.get(`
                SELECT COALESCE(SUM(answer_time),0)/count(*) as average
                FROM gameplayeranswer
                WHERE player_id = ? AND answer_time is not null AND correct = 0
            `, [player_id], success)
        })
    }
    
    get_guess_time(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.time:0)
            }
            this.conn.get(`
                SELECT COALESCE(SUM(correct_time),0) + COALESCE(SUM(miss_time),0) as time 
                FROM gameplayer
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    get_elo(player_id){
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else resolve(row?row.rating:null)
            }
            this.conn.get(`
                SELECT rating FROM elo
                WHERE player_id = ?
            `, [player_id], success)
        })
    }

    get_or_create_elo(player_id){
        return new Promise((resolve, reject) => {
            const success = (err) => {
                if(err) reject(err)
                else this.get_elo(player_id).then(elo => { resolve(elo) })
            }
            this.get_elo(player_id).then(elo => {
                if(elo){
                    resolve(elo)
                }else{
                    this.conn.run(`
                        INSERT INTO elo (player_id, rating) VALUES(
                        ?,
                        ?
                        )
                    `, [player_id, this.default_elo], success)
                }
            })
        })
    }

    update_elo(game_id, player_id, diff){
        return new Promise((resolve, reject) => {
            if (diff > 0){
                diff = Math.ceil(diff)
            }
            else{
                diff = Math.floor(diff)
            }
            const success = (err) => {
                if (err) reject(err)
                else resolve()
            }
            const step2 = (err) => {
                if(err){
                    reject(err)
                }else{
                    this.conn.run(`
                        INSERT INTO elodiff (game_id, player_id, rating_change) VALUES(
                        ?,
                        ?,
                        ?
                    )`, [game_id, player_id, diff], success)
                }
            }
            this.get_or_create_elo(player_id).then(elo => {
                this.conn.run(`
                    UPDATE elo
                    SET rating = ?
                    WHERE player_id = ?
                `, [elo + diff, player_id], step2)
            })
        })
    }

    clearScores = (startDate, endDate, username) => {
        return new Promise((resolve, reject) => {
            const success = (err, row) => {
                if (err) reject(err)
                else {
                    const done = function(err){ 
                        if (err) reject(err)
                        else resolve(this.changes)
                    }
                    /* this will work, whenever the sqlite3 module this depends on upgrades to SQLite 3.33, which was released 4 months ago...
                    this.conn.run(`
                        UPDATE gameplayer
                        SET result = 0, miss_count = 0, position = 99, correct_time = NULL, miss_time = NULL
                        FROM gameplayer gp
                        NATURAL JOIN game AS g
                        JOIN player AS p ON p.truename = $username
                        INNER JOIN administrator AS a on p.player_id = a.player_id
                        WHERE g.time >= $startDate AND g.time <= $endDate
                    `, {$startDate: startDate, $endDate: endDate, $username: username}, done)*/
                    //instead we get this mess:

                    this.is_administrator(username).then(is_admin => {
                        if(is_admin){
                            this.conn.run(`
                                UPDATE gameplayer
                                SET result = 0, miss_count = 0, position = 99, correct_time = NULL, miss_time = NULL
                                WHERE game_id IN (SELECT game_id from game where time >= $startDate AND time <= $endDate)
                            `, {$startDate: startDate, $endDate: endDate}, done)
                        }else{
                            reject("INTEGRITY ERROR: " + username + " IS NOT ADMIN")
                        }
                    })
                }
            }
            this.conn.run(`
                INSERT into gameplayerdeleted(game_id, player_id, result, miss_count, position, correct_time, miss_time, admin_id, removal_time)
                SELECT gp.game_id, gp.player_id, gp.result, gp.miss_count, gp.position, gp.correct_time, gp.miss_time, a.player_id, DATETIME('now')
                FROM gameplayer AS gp
                NATURAL JOIN game AS g
                JOIN player AS p ON p.truename = $username
                INNER JOIN administrator AS a on p.player_id = a.player_id
                WHERE g.time >= $startDate AND g.time <= $endDate
            `, {$startDate: startDate, $endDate: endDate, $username: username}, success)
        })
    }

    get_best_result = (player_id) =>{
        return new Promise((resolve, reject) => {
        //const list = await this.get_result_leaderboard(9999999) //this is too computationally expensive
        const success = (err, row) => {
            if (err) reject(err)
            else resolve(row?row:{result: null, time: null, count: 0})
        }
        this.conn.get(`
            SELECT result, MIN(time) as time, COUNT(*) as count
            FROM player p
            NATURAL JOIN gameplayer
            NATURAL JOIN game
            GROUP BY player_id, result
            HAVING player_id = $player_id AND result = (SELECT MAX(result) from gameplayer gp where gp.player_id = $player_id)
        `, {$player_id: player_id}, success)
        })
    }

    get_result_leaderboard = (top=10) =>{
        return new Promise((resolve, reject) => {
            const success = (err, rows) => {
                if (err) reject(err)
                else resolve(rows)
            }
            this.conn.all(`
                SELECT player_id, truename, result, MIN(time) as time, COUNT(*) as count
                FROM player p
                NATURAL JOIN gameplayer
                NATURAL JOIN game
                GROUP BY player_id, result
                HAVING player_id NOT IN (SELECT player_id FROM banned) AND result = (SELECT MAX(result) from gameplayer gp where gp.player_id = p.player_id)
                ORDER BY result DESC, count DESC, time ASC
                LIMIT ?
            `, [top], success)
        })
    }
    
    get_best_result_speedrun = (player_id) =>{
        return new Promise((resolve, reject) => {
        //const list = await this.get_result_leaderboard(9999999) //this is too computationally expensive
        const success = (err, row) => {
            if (err) reject(err)
            else resolve(row?row:{result: null, total_time:NaN, time: null, count:0})
        }
        this.conn.get(`
            SELECT result, MIN(time) as time, correct_time AS total_time, COUNT(*) as count
            FROM player p
            NATURAL JOIN gameplayer gp1
            NATURAL JOIN game
            GROUP BY player_id, result, correct_time
            HAVING player_id = $player_id 
                AND result = (SELECT MAX(result) from gameplayer gp where gp.player_id = p.player_id AND gp.correct_time is not null)
                AND correct_time = (SELECT MIN(correct_time) from gameplayer gp where gp.player_id = p.player_id AND gp.result = gp1.result)
        `, {$player_id: player_id}, success)
        })
    }

    
    get_result_leaderboard_speedrun = (top=10) =>{
        return new Promise((resolve, reject) => {
            const success = (err, rows) => {
                if (err) reject(err)
                else resolve(rows)
            }
            this.conn.all(`
                SELECT player_id, truename, result || 'p ' || correct_time || 'ms' as speedrun, MIN(time) as time, COUNT(*) as count
                FROM player p
                NATURAL JOIN gameplayer gp1
                NATURAL JOIN game
                GROUP BY player_id, result, correct_time
                HAVING player_id NOT IN (SELECT player_id FROM banned) 
                    AND result = (SELECT MAX(result) from gameplayer gp where gp.player_id = p.player_id AND gp.correct_time is not null)
                    AND correct_time = (SELECT MIN(correct_time) from gameplayer gp where gp.player_id = p.player_id AND gp.result = gp1.result)
                ORDER BY result DESC, correct_time ASC, count DESC, time ASC
                LIMIT ?
            `, [top], success)
        })
    }

    get_elo_leaderboard = (top=10) => {
        return new Promise((resolve, reject) => {
            const success = (err, rows) => {
                if (err) reject(err)
                else resolve(rows)
            }
            this.conn.all(`
                SELECT player_id, truename, MAX(rating) AS rating
                FROM player
                NATURAL JOIN elo
                GROUP BY player_id
                HAVING player_id NOT IN (SELECT player_id FROM banned)
                ORDER BY rating DESC
                LIMIT ?
            `, [top], success)
        })
    }

    get_last_game(username){
        return new Promise((resolve, reject) => {
            if (typeof username !== "string"){
                reject("get_last_game: username has to be string")
                return
            } 
            const success = (err, rows) => {
                if (err) reject(err)
                else resolve(rows)
            }
            this.conn.all(`
                SELECT anime, type, title, artist, link
                FROM player
                NATURAL JOIN gameplayer
                NATURAL JOIN gamesong
                NATURAL JOIN song
                WHERE username = $username
                AND game_id = (SELECT MAX(game_id) FROM gameplayer NATURAL JOIN player p WHERE p.username = $username)
                ORDER BY ordinal ASC
            `, {$username: username.toLowerCase(), }, success)
        })
    }

    get_missed_last_game(username){
        return new Promise((resolve, reject) => {
            if (typeof username !== "string"){
                reject("get_missed_last_game: username has to be string")
                return
            } 
            const success = (err, rows) => {
                if (err) reject(err)
                else resolve(rows)
            }
            this.conn.all(`
                SELECT anime, type, title, artist, link, answer
                FROM player
                NATURAL JOIN gameplayeranswer
                NATURAL JOIN gamesong
                NATURAL JOIN song
                WHERE username = $username AND correct = 0
                AND game_id = (select MAX(game_id) from gameplayer NATURAL JOIN player p where p.username = $username)
                ORDER by ordinal ASC
            `, {$username: username.toLowerCase(), }, success)
        })
    }

    record_game(song_list, players){
        return new Promise((resolve, reject) => {
            this.create_game(song_list.length, players.length).then(async (game_id) => {
                let counter = 0
                const song_list_with_ordinal = {}
                for (let i = 0; i < song_list.length; i++){
                    const song = song_list[i]
                    await this.add_song_to_game(game_id, song, counter)
                    song_list_with_ordinal[song.id] = counter
                    counter += 1
                }
                for (let i = 0; i < players.length; i++){
                    const p = players[i]
                    const correct_songs = p.correct_songs.length
                    const missed_songs = p.wrong_songs.length
                    let position = 1
                    for(let j = 0; j < players.length; j++){
                        const p2 = players[j]
                        if (p2.correct_songs.length > correct_songs){
                            position += 1
                        }
                    }
                    this.get_or_create_player_id(p.originalName).then(async (player_id) => { 
                        if(!player_id){
                            console.log("WEEEEEEIRD:", player_id, p.originalName)
                            reject()
                            return
                        }
                        await new Promise((fulfilled, failed) => {
                            const success = (err) => {
                                if (err) failed(err)
                                else fulfilled()
                            }
                            const sumAll = (acc, entry) => acc+(entry.time?entry.time:0)
                            const correctTime = p.correct_songs.reduce(sumAll, 0)
                            const missTime = p.wrong_songs.reduce(sumAll, 0)

                            const correctTimeData = correctTime?correctTime:null
                            const missTimeData = missTime?missTime:null
                            //to do stats with the time it's useful to avoid having garbage data polluting the result
                            this.conn.run(`
                                INSERT INTO gameplayer (game_id, player_id, result, miss_count, position, correct_time, miss_time) VALUES(
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                ?
                            )`, [game_id, player_id, correct_songs, missed_songs, position, correctTimeData, missTimeData], success)
                        })
                        for(let j = 0; j < p.correct_songs.length; j++){
                            const {song, answer, time} = p.correct_songs[j]
                            const ordinal = song_list_with_ordinal[song.id]
                            this.conn.run(`
                                INSERT INTO gameplayeranswer (game_id, player_id, ordinal, answer, answer_time, correct) VALUES(
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                1
                            )`, [game_id, player_id, ordinal, answer, time])
                        }
                        for(let j = 0; j < p.wrong_songs.length; j++){
                            const {song, answer, time} = p.wrong_songs[j]
                            const ordinal = song_list_with_ordinal[song.id]
                            this.conn.run(`
                                INSERT INTO gameplayeranswer (game_id, player_id, ordinal, answer, answer_time, correct) VALUES(
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                0
                            )`, [game_id, player_id, ordinal, answer, time])
                        }
                    })
                }
                //end of answer recording
                //beginning of elo recording

                
                this.get_bulk_player_id(players.map(p => p.originalName)).then(player_ids => {
                    this.get_bulk_elo(player_ids).then(elos => {
                        const player_id_elo_score = []
                        for (let i = 0; i < players.length; i++){
                            const p = players[i]
                            const player_id = player_ids[i]
                            const elo = elos[i]
                            const correct_songs = p.correct_songs.length
                            player_id_elo_score.push({player_id, elo, correct_songs})
                        }
                        const k = 32
                        const k2 = Math.floor(k*2/players.length)
                        for (let i = 0; i < player_id_elo_score.length; i++){
                            const {player_id: p, elo: elo1, correct_songs} = player_id_elo_score[i]
                            let diff = 0
                            for (let j = 0; j < player_id_elo_score.length; j++){
                                const {player_id: p2, elo: elo2, correct_songs: correct_songs2} = player_id_elo_score[j]
                                const ex1 = 1/(1+10**((elo2-elo1)/400))
                                const ex2 = 1/(1+10**((elo1-elo2)/400))
                                let s1 = 1
                                if (correct_songs == correct_songs2){
                                    s1 = 0.5
                                }else if (correct_songs < correct_songs2){
                                    s1 = 0
                                }
                                const diff2 = (s1 - ex1) * k2
                                diff += diff2
                            }
                            diff = Math.min(k,Math.max(diff, -k))
                            this.update_elo(game_id, p, diff)
                        }
                        resolve()
                    })
                })
                
            })
        })
    }

    get_bulk_player_id(usernames=[]){
        return new Promise((resolve, reject) => {
            const target = usernames.length
            let counter = 0
            const func = (ids) => {
                this.get_or_create_player_id(usernames[counter]).then(id => {
                    ids.push(id)
                    counter++
                    if(counter >= target){
                        resolve(ids)
                    }else{
                        func(ids)
                    }
                })
            }
            func([])
        })
    }

    get_bulk_elo(player_ids=[], callback){
        return new Promise((resolve, reject) => {
            const target = player_ids.length
            let counter = 0
            const func = (elos) => {
                this.get_or_create_elo(player_ids[counter]).then(elo => {
                    elos.push(elo)
                    counter++
                    if(counter >= target){
                        resolve(elos)
                    }else{
                        func(elos)
                    }
                })
            }
            func([])
        })
    }


    
    dud(){
        //this does nothing, just prevents optional callbacks from destroying the world
    }
}
module.exports = {Database}