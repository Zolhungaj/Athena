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
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        truename TEXT NOT NULL
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS message(
        id INTEGER PRIMARY KEY,
        player_id INTEGER,
        time TEXT,
        content TEXT,
        FOREIGN KEY(player_id) REFERENCES player(id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS banned(
        player_id INTEGER PRIMARY KEY,
        reason TEXT,
        banner INTEGER NOT NULL,
        FOREIGN KEY(player_id) REFERENCES player(id),
        FOREIGN KEY(banner) REFERENCES player(id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS level(
        player_id INTEGER PRIMARY KEY,
        level INTEGER NOT NULL,
        FOREIGN KEY(player_id) REFERENCES player(id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS avatar(
        player_id INTEGER PRIMARY KEY,
        avatar TEXT NOT NULL,
        FOREIGN KEY(player_id) REFERENCES player(id)
        );`)
        c.run(`CREATE TABLE IF NOT EXISTS game(
        id INTEGER PRIMARY KEY,
        song_count INTEGER,
        player_count INTEGER,
        time TEXT
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS gametoplayer(
        game_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        result INTEGER,
        miss_count INTEGER,
        position INTEGER,
        PRIMARY KEY(game_id, player_id),
        FOREIGN KEY(game_id) REFERENCES game(id),
        FOREIGN KEY(player_id) REFERENCES player(id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS gameplayertomissed(
        game_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        ordinal INTEGER,
        answer TEXT,
        PRIMARY KEY(game_id, player_id, ordinal),
        FOREIGN KEY(game_id) REFERENCES game(id),
        FOREIGN KEY(player_id) REFERENCES player(id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS gameplayertocorrect(
        game_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        ordinal INTEGER,
        answer TEXT,
        PRIMARY KEY(game_id, player_id, ordinal),
        FOREIGN KEY(game_id) REFERENCES game(id),
        FOREIGN KEY(player_id) REFERENCES player(id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS elo(
        player_id INTEGER PRIMARY KEY,
        rating INTEGER NOT NULL,
        FOREIGN KEY(player_id) REFERENCES player(id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS elodiff(
        game_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        rating_change INTEGER NOT NULL,
        PRIMARY KEY(game_id, player_id),
        FOREIGN KEY(player_id) REFERENCES player(id),
        FOREIGN KEY(game_id) REFERENCES game(id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS song(
        id INTEGER PRIMARY KEY,
        anime TEXT,
        type TEXT,
        title TEXT,
        artist TEXT,
        link TEXT
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS gametosong(
        game_id INTEGER NOT NULL,
        song_id INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        PRIMARY KEY(game_id, ordinal),
        FOREIGN KEY(game_id) REFERENCES game(id),
        FOREIGN KEY(song_id) REFERENCES song(id)
        )`)
        c.run(`CREATE TABLE IF NOT EXISTS valour(
        player_id INTEGER PRIMARY KEY,
        surplus INTEGER NOT NULL,
        referer_id INTEGER,
        FOREIGN KEY(player_id) REFERENCES player(id),
        FOREIGN KEY(referer_id) REFERENCES player(id)
        )
        `)
        c.run(`CREATE TABLE IF NOT EXISTS administrator(
        player_id INTEGER PRIMARY KEY,
        source INTEGER,
        FOREIGN KEY(player_id) REFERENCES player(id),
        FOREIGN KEY(source) REFERENCES player(id)
        )
        `)
        c.run(`CREATE TABLE IF NOT EXISTS moderator(
        player_id INTEGER PRIMARY KEY,
        source INTEGER,
        FOREIGN KEY(player_id) REFERENCES player(id),
        FOREIGN KEY(source) REFERENCES player(id)
        )
        `)
        this.conn.run(`INSERT INTO player VALUES(
            0,
            '<system>',
            '<System>'
        );`, [], this.dud)
        this.conn.run(`INSERT INTO administrator VALUES(
            0,
            0
            );`, [], this.dud)
        this.conn.run(`INSERT INTO moderator VALUES(
            0,
            0
            );`, [], this.dud)
    }

    destroy = () => {
        this.conn.close()
    }

    create_player(username, callback){
        //this also doubles as the get_or_create, but it is fundamentally slower 
        //due to the guaranteed fail on insert of existing person
        const ret = (err) => {
            this.get_player_id(username, callback)
        }
        this.conn.run(`INSERT INTO player VALUES(
        NULL,
        (?),
        ?
        )`, [username.toLowerCase(), username], ret)
    }

    change_name(old_name, new_name, callback=this.dud){
        //this also doubles as the get_or_create, but it is fundamentally slower 
        //due to the guaranteed fail on insert of existing person
        const ret = (err) => {
            callback(err?false:true)
        }
        old_name = old_name.toLowerCase()
        const new_username = new_name.toLowerCase()
        this.conn.run(`
            UPDATE player
            SET username = ?,
            truename = ?
            WHERE username = ?
            `, [new_username, new_name, old_name], ret)
    }

    get_player_id(username="", callback){
        const ret = (err, row) => {
            callback(row?row.id:null)
        }
        this.conn.get(`SELECT id FROM player WHERE username=(?)`, [username.toLowerCase()], ret)
    }

    get_or_create_player_id(username, callback){
        const ret = (player_id) => {
            if(player_id){
                callback(player_id)
            }else{
                this.create_player(username, callback)
            }
        }
        this.get_player_id(username, ret)
    }

    get_player_username(player_id, callback){
        const ret = (err, row) => {
            callback(row?row.username:null)
        }
        this.conn.get(`SELECT username FROM player WHERE id=(?)`, [player_id], ret)
    }

    get_player_truename(player_id, callback){
        const ret = (err, row) => {
            callback(row?row.truename:null)
        }
        this.conn.get(`SELECT truename FROM player WHERE id=(?)`, [player_id], ret)
    }

    get_player(username, callback){
        const outer_ret = (player_id) => {
            const ret = (banned) => {
                const ret_inner = (avatar) => {
                    const manual_curry = (level) => {
                        callback({player_id, level, avatar, banned})
                    }
                    this.get_player_level(player_id, manual_curry)
                }
                this.get_player_avatar(player_id, ret_inner)
            }
            if(!player_id){
                callback({player_id:null, level:null, avatar:null, banned:null})
            }else{
                this.is_banned(username, ret)
            }
        }
        this.get_player_id(username, outer_ret)
    }

    get_player_level(player_id, callback){
        const ret = (err, row) => {
            callback(row?row.level:null)
        }
        this.conn.get(`SELECT level FROM level WHERE player_id=(?)`, [player_id], ret)
    }

    update_player_level(player_id, new_level, callback=this.dud){
        const success = (err) => {
            callback(!err)
        }
        const ret = (err) => {
            if(err){
                this.conn.run("UPDATE level SET level = ? WHERE player_id = ?", [new_level, player_id], success)
            }else{
                callback(true)
            }
        }
        this.conn.run("INSERT INTO level VALUES(?,?)", [player_id, new_level], ret)
    }

    get_player_avatar(player_id, callback){
        const ret = (err, row) => {
            callback(err?null:row?JSON.parse(row.avatar):null)
        }
        this.conn.get(`SELECT avatar FROM avatar WHERE player_id=(?)`, [player_id], ret)
    }

    update_player_avatar(player_id, new_avatar, callback=this.dud){
        new_avatar = JSON.stringify(new_avatar)
        const success = (err) => {
            callback(!err)
        }
        const ret = (err) => {
            if(err){
                this.conn.run("UPDATE avatar SET avatar = ? WHERE player_id = ?", [new_avatar, player_id], success)
            }else{
                callback(true)
            }
        }
        this.conn.run("INSERT INTO avatar VALUES(?,?)", [player_id, new_avatar], ret)
    }

    save_message(username, message, callback=this.dud){
        const ret = (player_id) => {
            const success = (err) => {
                callback(!err)
            }
            this.conn.run(`
                INSERT INTO message VALUES(
                NULL,
                (?),
                DATETIME('now'),
                (?)
            )`, [player_id, message], success)
        }
        this.get_or_create_player_id(username, ret)
    }

    ban_player(username, reason=null, banner=null, callback=this.dud){   
        const outer_ret = (player_id) => {
            const ret = (banner_id) => {
                const success = (err) => {
                    callback(!err)
                }
                this.conn.run(`
                    INSERT INTO banned VALUES(
                    (?),
                    (?),
                    (?)
                )`, [player_id, reason, banner_id], success)
            }
            if(banner){
                this.get_or_create_player_id(banner, ret)
            }else{
                ret(0)
            }
        }
        this.get_or_create_player_id(username, outer_ret)
    }

    unban_player(username, callback=this.dud){
        const success = (err) => {
            callback(!err)
        }
        const ret = (player_id) => {
            this.conn.run(`
            DELETE FROM banned
            WHERE player_id = ?
            `, [player_id], success)
        }
        this.get_player_id(username, ret)
    }

    is_banned(username, callback=this.dud){
        const success = (err, row) => {
            callback(err?false:row?true:false)
        }
        const ret = (player_id) => {
            this.conn.run(`
            SELECT player_id FROM banned
            WHERE player_id = ?
            `, [player_id], success)
        }
        this.get_player_id(username, ret)
    }

    ban_readable(username=null, banner=null, callback){
        const ret = (err, rows) => {
            callback(err?[]:rows)
        }
        let query = `
        SELECT p.username as thePlayer, reason, p2.username as theBanner
        FROM banned AS b
        JOIN player p
            ON p.id = b.player_id
        JOIN player p2
            ON p2.id = b.banner
        `
        if (username){
            if (banner){
                query += "WHERE p.username = ? AND p2.username = ?;"
                this.conn.all(query, [username, banner], ret)
            } else{
                query += "WHERE p.username = ?;"
                this.conn.all(query, [username], ret)
            }
        }else if (banner){
            query += "WHERE p2.username = ?;"
            this.conn.all(query, [banner], ret)
        }else{
            this.conn.all(query+";", [], ret)
        }
    }

    add_administrator(username, source=undefined, callback=this.dud){
        const outer_ret = (player_id) => {
            const ret = (source_id) => {
                source_id = source_id || 0
                const success = (err) => {
                    callback(!err)
                }
                this.conn.run(`INSERT INTO administrator VALUES(
                    ?,
                    ?
                    )`, [player_id, source_id], success)
            }
            this.get_player_id(source, ret)
        }
        this.get_or_create_player_id(username, outer_ret)
    }

    remove_administrator(username, callback=this.dud){
        const success = (err) => {
            callback(!err)
        }
        const ret = (player_id) => {
            this.conn.run(`DELETE FROM administrator
            WHERE player_id = ?`, [player_id], success)
        }
        this.get_player_id(username, ret)
    }

    is_administrator(username, callback){
        const success = (err, row) => {
            callback(!err&&!!row)//!! is an idiom for is not false, it's less wordy than Boolean()
        }
        const ret = (player_id) => {
            this.conn.get(` 
            SELECT *
            FROM administrator
            WHERE player_id = ?`, [player_id], success)
        }
        this.get_player_id(username, ret)
    }

    add_moderator(username, source=null, callback=this.dud){
        const outer_ret = (player_id) => {
            const ret = (source_id) => {
                source_id = source_id || 0
                const success = (err) => {
                    callback(!err)
                }
                this.conn.run(`INSERT INTO moderator VALUES(
                    ?,
                    ?
                    )`, [player_id, source_id], success)
            }
            this.get_player_id(source, ret)
        }
        this.get_or_create_player_id(username, outer_ret)
    }

    remove_moderator(username, callback=this.dud){
        const success = (err) => {
            callback(!err)
        }
        const ret = (player_id) => {
            this.conn.run(`DELETE FROM moderator
            WHERE player_id = ?`, [player_id], success)
        }
        this.get_player_id(username, ret)
    }

    is_moderator(username, callback){
        const success = (err, row) => {
            callback(!err&&!!row)
        }
        const ret = (player_id) => {
            this.conn.get(` 
            SELECT *
            FROM moderator
            WHERE player_id = ?`, [player_id], success)
        }
        const isAdmin = (bool) => {
            if(bool){
                callback(true)
            }else{
                this.get_player_id(username, ret)
            }
        }
        this.is_administrator(username, isAdmin)
    }

    add_valour(username, referer=null, callback=this.dud){
        //valour is a joke I added to hone my skills on recursive database calls
        const success = (err) => {
            if(err){
                callback(false)
            }else{
                this.change_valour_surplus(referer, -1, callback)
            }
        }
        const outer_ret = (player_id) => {
            const inner_ret = (referer_id) => {
                referer_id = referer_id || 0
                this.conn.run(`INSERT INTO valour VALUES(
                    ?,
                    2,
                    ?
                    )`, [player_id, referer_id], success)
            }
            if(!player_id){
                callback(false)
            }else{
                this.get_player_id(referer, inner_ret)
            }
        }
        const ret = (surplus) => {
            if(surplus <= 0){
                callback(false)
            }else{
                this.get_player_id(username, outer_ret)
            }
        }
        this.get_valour_surplus(referer, ret)
    }

    has_valour(username, callback){
        const ret = (player_id) => {
            const success = (err, row) => {
                callback(!err&&row)
            }
            this.conn.execute(`
                SELECT player_id
                FROM valour
                WHERE player_id = ?
            `, [player_id], success)
        }
        this.get_player_id(username, ret)
    }

    get_valour_surplus(username, callback){
        const ret1 = (bool) => {
            if(bool){
                this.get_player_id(username, ret2)
            }else{
                callback(-1)
            }
        }
        const ret2 = (player_id) => {
            return this.conn.get(`
                SELECT surplus
                FROM valour
                WHERE player_id = ?
            `, [player_id], success)
        }
        const success = (err, row) => {
            if(err){
                callback(-2)
            }else{
                callback(row?row.id:-3)
            }
        }
        this.has_valour(username, ret1)
    }

    change_valour_surplus(username, change, callback=this.dud){
        const success = (err) => {
            callback(!err)
        }
        const ret = (surplus) => {
            if(surplus < 0){
                callback(false)
            }else{
                const new_surplus = surplus + change
                const inner_ret = (player_id) => {
                    this.conn.run(`
                        UPDATE valour
                        SET surplus = ?
                        WHERE player_id = ?
                    `, [new_surplus, player_id], success)
                }
                this.get_player_id(username, inner_ret)
            }
        }
        this.get_valour_surplus(username, ret)    
    }
        

    valour_readable(callback){
        const ret = (err, rows) => {
            callback(err?[]:rows)
        }
        this.conn.all(`
        WITH RECURSIVE record (lvl, player_id, referer_id) AS
        (SELECT 0, v.player_id AS player_id, v.referer_id AS referer_id
            FROM valour v
                WHERE v.referer_id IS NULL
        UNION ALL
        SELECT r.lvl+1, v.player_id, v.referer_id
            FROM record AS r
                JOIN valour v
                    ON r.player_id = v.referer_id)
        SELECT r.lvl, p.username, p2.username
        FROM record AS r
        JOIN player AS p on p.id = r.player_id
        LEFT OUTER JOIN player as p2 on p2.id = r.referer_id
        ORDER BY r.lvl, p.username, p2.username`, [], ret)
    }

    get_song_id(song, callback){
        const ret = (err, row) => {
            callback(err?null:row?row.id:null)
        }
        this.conn.get(`
        SELECT id FROM song
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
        `, [song.anime, song.type, song.name, song.artist, song.link], ret)
    }

    get_or_create_song_id(song, callback){
        const ret2 = (err) => {
            if(err){
                callback(null)
            }else{
                this.get_song_id(song, callback)
            }
        }
        const ret = (res) => {
            if(res){
                callback(res)
            }else{
                this.conn.run(`
                    INSERT INTO song VALUES(
                    NULL,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?)
                `, [song.anime, song.type, song.name, song.artist, song.link], ret2)
            }
        }
        this.get_song_id(song, ret)
    }

    create_game(song_count, player_count, callback){
        const step3 = (err, row) => {
            callback(err?null:row?row.id:null)
        }
        const step2 = (err) => {
            if(err){
                callback(null)
            }else{
                this.conn.get(`
                    SELECT id FROM game
                    ORDER BY id DESC
                    LIMIT 1
                `, [], step3)
            }
        }
        //step1:
        this.conn.run(`
        INSERT INTO game VALUES(
        NULL,
        ?,
        ?,
        DATETIME('now')
        )`, [song_count, player_count], step2)
    }

    add_song_to_game(game_id, song, ordinal, callback=this.dud){
        const success = (err) => {
            callback(!err)
        }
        const ret = (song_id) => {
            this.conn.run(`
            INSERT INTO gametosong VALUES(
            ?,
            ?,
            ?
            )`, [game_id, song_id, ordinal], success)
        }
        this.get_or_create_song_id(song, ret)
    }

    get_all_ratings(callback){
        const ret = (err, rows) => {
            callback(err?[]:rows)
        }
        this.conn.all(`
        SELECT DISTINCT(g.player_id), rating
        FROM gametoplayer g
        INNER JOIN elo e
        ON e.player_id = g.player_id
        ORDER BY rating DESC`, [], ret)
    }

    get_total_games(callback){
        const ret = (err, row) => {
            callback(err?null:row?row.c:null)
        }
        this.conn.get(`
        SELECT count(*) as c FROM game`, [], ret)
    }

    get_player_game_count(player_id, callback){
        const ret = (err, row) => {
            callback(err?null:row?row.c:null)
        }
        this.conn.get(`
        SELECT count(*) as c FROM gametoplayer
        WHERE player_id = ?`, [player_id], ret)
    }

    get_player_win_count(player_id, callback){
        const ret = (err, row) => {
            callback(err?null:row?row.c:null)
        }
        this.conn.get(`
        SELECT count(*) as c FROM gametoplayer
        WHERE player_id = ?
        AND position = 1`, [player_id], ret)
    }

    get_player_hit_count(player_id, callback){
        const ret = (err, row) => {
            if(err){
                callback(0)
            } else if (row){
                if(row.s){
                    callback(row.s)
                }else{
                    callback(0)
                }
            }else{
                callback(0)
            }
        }
        this.conn.get(`
        SELECT SUM(result) as s FROM gametoplayer
        WHERE player_id = ?`, [player_id], ret)
    }

    get_player_miss_count(player_id, callback){
        const ret = (err, row) => {
            callback(err?0:row?row.s:0)
        }
        this.conn.get(`
        SELECT SUM(miss_count) as s FROM gametoplayer
        WHERE player_id = ?`, [player_id], ret)
    }

    get_player_song_count(player_id, callback){
        const ret = (hit_count) => {
            const inner_ret = (miss_count) => {
                callback(hit_count+miss_count)
            }
            this.get_player_miss_count(player_id, inner_ret)
        }
        this.get_player_hit_count(player_id, ret)
    }

    get_player_hit_rate(player_id, callback){
        const ret = (hit_count) => {
            const inner_ret = (total) => {
                callback((hit_count/total*100).toFixed(2) + "%")
            }
            this.get_player_song_count(player_id, inner_ret)
        }
        this.get_player_hit_count(player_id, ret)
    }

    get_player_hit_miss_ratio(player_id, callback){
        const ret = (hit) => {
            const inner_ret = (miss) => {
                let res = ""
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
                callback(res)
            }
            this.get_player_miss_count(player_id, inner_ret)
        }
        this.get_player_hit_count(player_id, ret)
        
    }

    get_elo(player_id, callback){
        const ret = (err, row) => {
            callback(err?null:row?row.rating:null)
        }
        this.conn.get(`
        SELECT rating FROM elo
        WHERE player_id = ?`, [player_id], ret)
    }

    get_or_create_elo(player_id, callback){
        const ret2 = (err) => {
            if(err){
                callback(null)
            }else{
                this.get_elo(player_id, callback)
            }
        }
        const ret1 = (elo) => {
            if(elo){
                callback(elo)
            }else{
                this.conn.run(`
                    INSERT INTO elo VALUES(
                    ?,
                    ?
                    )`, [player_id, this.default_elo], ret2)
            }
        }
        this.get_elo(player_id, ret1)
    }

    update_elo(game_id, player_id, diff, callback=this.dud){
        if (diff > 0){
            diff = Math.ceil(diff)
        }
        else{
            diff = Math.floor(diff)
        }
        const ret3 = (err) => {
            callback(!err)
        }
        const ret2 = (err) => {
            if(err){
                callback(false)
            }else{
                this.conn.run(`
                    INSERT INTO elodiff VALUES(
                    ?,
                    ?,
                    ?
                )`, [game_id, player_id, diff], ret3)
            }
        }
        const ret = (elo) => {
            this.conn.run(`
                UPDATE elo
                SET rating = ?
                WHERE player_id = ?
            `, [elo + diff, player_id], ret2)
        }
        this.get_or_create_elo(player_id, ret)
    }

    get_result_leaderboard_player_id = (top=10, callback) =>{
        const ret = (err, rows) => {
            callback(err?[]:rows)
        }
        this.conn.all(`
            SELECT player_id, MAX(result) as result
            FROM gametoplayer
            WHERE player_id not in (SELECT player_id FROM banned)
            GROUP BY player_id
            ORDER BY result DESC
            LIMIT ?
        `, [top], ret)
    }

    get_result_leaderboard_truename = (top=10, callback) =>{
        const ret = (err, rows) => {
            callback(err?[]:rows)
        }
        this.conn.all(`
            SELECT truename, MAX(result) as result
            FROM player
            JOIN gametoplayer
            ON player_id=id
            WHERE player_id not in (SELECT player_id FROM banned)
            GROUP BY player_id
            ORDER BY result DESC
            LIMIT ?
        `, [top], ret)
    }

    get_elo_leaderboard_player_id = (top=10, callback) => {
        const ret = (err, rows) => {
            callback(err?[]:rows)
        }
        this.conn.all(`
            SELECT player_id, MAX(rating) as rating
            FROM elo
            GROUP BY player_id
            WHERE player_id not in (SELECT player_id FROM banned)
            ORDER BY rating DESC
            LIMIT ?
        `, [top], ret)
    }

    get_elo_leaderboard_truename = (top=10, callback) => {
        const ret = (err, rows) => {
            callback(err?[]:rows)
        }
        this.conn.all(`
            SELECT truename, MAX(rating) as rating
            FROM player
            JOIN elo
            ON player_id=id
            WHERE player_id not in (SELECT player_id FROM banned)
            GROUP BY player_id
            ORDER BY rating DESC
            LIMIT ?
        `, [top], ret)
    }

    get_last_game(username, callback){
        const success = (err, rows) => {
            callback(err?[]:rows)
        }
        username = username.toLowerCase()
        this.conn.all(`
            SELECT anime, type, title, artist, link
            FROM player p
            JOIN gametoplayer gp ON p.id = gp.player_id
            natural join gametosong gs
            join song s on gs.song_id = s.id
            WHERE username = $username
            AND game_id = (select MAX(game_id) from gametoplayer gp2 join player p2 on p2.id = gp2.player_id where p2.username = $username)
            ORDER by ordinal ASC
        `, {$username: username, }, success)
    }

    get_missed_last_game(username, callback){
        const success = (err, rows) => {
            callback(err?[]:rows)
        }
        username = username.toLowerCase()
        this.conn.all(`
            SELECT anime, type, title, artist, link, answer
            FROM player p
            JOIN gameplayertomissed gp ON p.id = gp.player_id
            natural join gametosong gs
            join song s on gs.song_id = s.id
            WHERE username = $username
            AND game_id = (select MAX(game_id) from gametoplayer gp2 join player p2 on p2.id = gp2.player_id where p2.username = $username)
            ORDER by ordinal ASC
        `, {$username: username, }, success)
    }

    record_game(song_list, players){
        const great_wrapper = (game_id) => {
            let counter = 0
            const song_list_with_ordinal = {}
            for (let i = 0; i < song_list.length; i++){
                const song = song_list[i]
                this.add_song_to_game(game_id, song, counter)
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
                const smaller_wrapper = (player_id) => { 
                    if(!player_id){
                        console.log("WEEEEEEIRD:", player_id, p.name)
                        return
                    }
                    this.conn.run(`
                    INSERT into gametoplayer VALUES(
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                    )`, [game_id, player_id, correct_songs, missed_songs, position])
                    for(let j = 0; j < p.correct_songs.length; j++){
                        const {song, answer} = p.correct_songs[j]
                        const ordinal = song_list_with_ordinal[song.id]
                        this.conn.run(`
                        INSERT into gameplayertocorrect VALUES(
                        ?,
                        ?,
                        ?,
                        ?
                        )`, [game_id, player_id, ordinal, answer])
                    }
                    for(let j = 0; j < p.wrong_songs.length; j++){
                        const {song, answer} = p.wrong_songs[j]
                        const ordinal = song_list_with_ordinal[song.id]
                        this.conn.run(`
                        INSERT into gameplayertomissed VALUES(
                        ?,
                        ?,
                        ?,
                        ?
                        )`, [game_id, player_id, ordinal, answer])
                    }

                }
                this.get_or_create_player_id(p.name, smaller_wrapper)
            }
            const player_id_wrapper = (player_ids) => {
                const elos_wrapper = (elos) => {
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

                }
                this.get_bulk_elo(player_ids, elos_wrapper)
            }
            const usernames = []
            for(let i = 0; i < players.length; i++){
                usernames.push(players[i].name)
            }
            this.get_bulk_player_id(usernames, player_id_wrapper)
        }
        this.create_game(song_list.length, players.length, great_wrapper)
    }

    get_bulk_player_id(usernames=[], callback){
        const target = usernames.length
        let counter = 0
        let func = (ids) => {
            let ret = (id) => {
                ids.push(id)
                counter++
                if(counter >= target){
                    callback(ids)
                }else{
                    func(ids)
                }
            }
            const username = usernames[counter]
            this.get_or_create_player_id(username, ret)
        }
        func([])
    }

    get_bulk_elo(player_ids=[], callback){
        const target = player_ids.length
        let counter = 0
        let func = (elos) => {
            let ret = (elo) => {
                elos.push(elo)
                counter++
                if(counter >= target){
                    callback(elos)
                }else{
                    func(elos)
                }
            }
            const p = player_ids[counter]
            this.get_or_create_elo(p, ret)
        }
        func([])
    }


    
    dud(){
        //this does nothing, just prevents optional callbacks from destroying the world
    }
}

/*
if __name__ == "__main__":
    // a basic test of the functions
    database = Database(":memory:")
    assert database.get_player_id("player1") is None
    assert database.create_player("player1") == 1
    assert database.get_or_create_player_id("player2") == 2
    assert database.get_or_create_player_id("player2") == 2
    assert database.get_player_id("player2") == 2
    database.save_message("player3", "message1")
    database.ban_player("player4")
    database.ban_player("player3", "reason1", "player2")
    database.create_player("player9")
    assert database.add_valour("player4")
    assert not database.add_valour("player5")
    assert database.add_valour("player3", "player4")
    assert not database.add_valour("player2", "player1")
    assert database.add_valour("player1", "player3")
    assert database.add_valour("player2", "player4")
    assert not database.add_valour("player6", "player4")
    print(database.valour_readable())
    print(database.ban_readable())
    print(database.ban_readable("player4"))
    print(database.ban_readable(banner="player2"))
    print(database.conn.execute(input()).fetchall())
*/
module.exports = {Database}