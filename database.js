const sqlite3 = require("sqlite3")

//this was ported from the previous contest bot, it was originally in python

class Database{
    constructor(database_file){
        this.database_file = database_file
        this.conn = new sqlite3(database_file).verbose()
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

    create_player(username){
        try{
            this.conn.run(`INSERT INTO player VALUES(
            NULL,
            (?),
            ?
            )`, [username.lower(), username])
        }catch(e){
            return null
        }
        return this.get_player_id(username)
    }

    get_player_id(username){
        if (!username){
            return null
        }
        username = username.lower()
        const result = this.conn.get(`SELECT id FROM player WHERE username=(?)`, [username])
        return result?result.id:null
    }

    get_or_create_player_id(username){
        const player_id = this.get_player_id(username)
        return player_id?player_id:this.create_player(username)
    }

    get_player_username(player_id){
        const result = this.conn.get(`SELECT username FROM player WHERE id=(?)`, [player_id])
        return result?result.username:""
    }

    get_player_truename(player_id){
        const result = this.conn.get(`SELECT truename FROM player WHERE id=(?)`, [player_id])
        return result?result.truename:""
    }

    save_message(username, message){
        player_id = this.get_or_create_player_id(username)
        this.conn.run(`
        INSERT INTO message VALUES(
        NULL,
        (?),
        DATETIME('now'),
        (?)
        )`, [player_id, message])
    }

    ban_player(username, reason=null, banner=null){
        const player_id = this.get_or_create_player_id(username)
        const banner_id = banner?this.get_or_create_player_id(banner):0
        this.conn.run(`
        INSERT INTO banned VALUES(
        (?),
        (?),
        (?)
        )`, [player_id, reason, banner_id])
    }

    unban_player(username){
        this.conn.run(`
        DELETE FROM banned
        WHERE player_id = ?
        `, [this.get_player_id(username)])
    }

    ban_readable(username=null, banner=null){
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
                return this.conn.all(query, [username, banner])
            } else{
                query += "WHERE p.username = ?;"
                return this.conn.all(query, [username])
            }
        }else if (banner){
            query += "WHERE p2.username = ?;"
            return this.conn.all(query, [banner])
        }else{
            return this.conn.all(query+";")
        }
    }
    add_administrator(username, source=null){
        //this.add_moderator(username, source)
        const player_id = this.get_or_create_player_id(username)
        const source_id = this.get_player_id(source)||0
        try{
            this.conn.run(`INSERT INTO administrator VALUES(
            ?,
            ?
            )`, [player_id, source_id])
        }catch(e){
            return false
        }     
        return true
    }

    remove_administrator(username){
        this.conn.run(`DELETE FROM administrator
        WHERE player_id = ?`, [this.get_player_id(username)])
    }

    is_administrator(username){
        return !!this.conn.get(` 
        SELECT *
        FROM administrator
        WHERE player_id = ?`, [this.get_player_id(username)])
        //!! is an idiom for is not false, it's less wordy than Boolean(huge function)
    }

    add_moderator(username, source=null){
        const player_id = this.get_or_create_player_id(username)
        const source_id = this.get_player_id(source)||0
        try{
            this.conn.run(`INSERT INTO moderator VALUES(
            ?,
            ?
            )`, [player_id, source_id])
        }catch(e){
            return false
        }
        return true
    }

    remove_moderator(username){
        this.conn.run(`DELETE FROM moderator
        WHERE player_id = ?`, [this.get_player_id(username)])
    }

    is_moderator(username){
        if(this.is_administrator(username)){
            return true
        }
        return !!this.conn.get(`
        SELECT *
        FROM moderator
        WHERE player_id = ?`, [this.get_player_id(username)])
    }

    add_valour(username, referer=null){
        //valour is a joke I added to hone my skills on recursive database calls
        if (referer){
            if (this.get_valour_surplus(referer) <= 0){
                return false
            }
        }
        try{
            this.conn.run(`INSERT INTO valour VALUES(
            ?,
            2,
            ?
            )`, [this.get_player_id(username), this.get_player_id(referer)])
            
            this.change_valour_surplus(referer, -1)
        }catch(e){
            return false
        }
        return true
    }

    has_valour(username){
        return !!this.conn.execute(`
        SELECT player_id
        FROM valour
        WHERE player_id = ?`, [this.get_player_id(username)])
    }

    get_valour_surplus(username){
        if (this.has_valour(username)){
            return this.conn.get(`
                SELECT surplus
                FROM valour
                WHERE player_id = ?
            `, [this.get_player_id(username)]).surplus
        }
        else{
            return -1
        }
    }

    change_valour_surplus(username, change){
        const new_surplus = this.get_valour_surplus(username) + change
        this.conn.run(`UPDATE valour
        SET surplus = ?
        WHERE player_id = ?
        `, [new_surplus, this.get_player_id(username)])
    }
        

    valour_readable(){
        return this.conn.all(`
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
        ORDER BY r.lvl, p.username, p2.username`)
    }

    get_song_id(song){
        return this.conn.get(`
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
        `, [song.anime, song.type, song.name, song.artist, song.link]).id
    }

    get_or_create_song_id(song){
        let res = this.get_song_id(song)
        if (!res){
            this.conn.run(`
            INSERT INTO song VALUES(
            NULL,
            ?,
            ?,
            ?,
            ?,
            ?)
            `, [song.anime, song.type, song.name, song.artist, song.link])
            res = this.get_song_id(song)
        }
        return res
    }

    create_game(song_count, player_count){
        this.conn.run(`
        INSERT INTO game VALUES(
        NULL,
        ?,
        ?,
        DATETIME('now')
        )`, [song_count, player_count])
        return this.conn.get(`
        SELECT id FROM game
        ORDER BY id DESC
        LIMIT 1`).id
    }

    add_song_to_game(game_id, song, ordinal){
        this.conn.run(`
        INSERT INTO gametosong VALUES(
        ?,
        ?,
        ?
        )`, [game_id, this.get_or_create_song_id(song), ordinal])
    }

    get_all_ratings(){
        return this.conn.all(`
        SELECT DISTINCT(g.player_id), rating
        FROM gametoplayer g
        INNER JOIN elo e
        ON e.player_id = g.player_id
        ORDER BY rating DESC`)
    }

    get_total_games(){
        return this.conn.get(`
        SELECT count(*) as c FROM game`).c
    }

    get_player_game_count(player_id){
        return this.conn.get(`
        SELECT count(*) as c FROM gametoplayer
        WHERE player_id = ?`, [player_id]).c
    }

    get_player_win_count(player_id){
        return this.conn.get(`
        SELECT count(*) as c FROM gametoplayer
        WHERE player_id = ?
        AND position = 1`, [player_id]).c
    }

    get_player_hit_count(player_id){
        const hit = this.conn.get(`
        SELECT SUM(result) as s FROM gametoplayer
        WHERE player_id = ?`, [player_id])
        return hit?hit.s:0
    }

    get_player_miss_count(player_id){
        const miss = this.conn.get(`
        SELECT SUM(miss_count) as s FROM gametoplayer
        WHERE player_id = ?`, [player_id])
        return miss?miss.s:0
    }

    get_player_song_count(player_id){
        return this.get_player_hit_count(player_id) + this.get_player_miss_count(player_id)
    }

    get_player_hit_rate(player_id){
        const hit = this.get_player_hit_count(player_id)
        const total = this.get_player_song_count(player_id)
        return (hit/total*100).toFixed(2) + "%"
    }

    get_player_hit_miss_ratio(player_id){
        const hit = this.get_player_hit_count(player_id)
        const miss = this.get_player_miss_count(player_id)
        if(!hit&&!miss){
            return "0:0"
        }else if (hit == miss){
            return "1:1"
        }else if (!miss){
            return "1:0"
        }else if (!hit) {
            return "0:1"
        }else if (hit > miss){
            return (hit/miss).toFixed(2) + ":1"
        }else{
            return "1:" + (miss/hit).toFixed(2)
        }
    }
    get_elo(player_id){
        return this.conn.get(`
        SELECT rating FROM elo
        WHERE player_id = ?`, [player_id]).rating
    }

    get_or_create_elo(player_id){
        let res = this.get_elo(player_id)
        if (!res){
            default_elo = 1400
            this.conn.run(`
            INSERT INTO elo VALUES(
            ?,
            ?
            )`, (player_id, this.default_elo))
            res = this.get_elo(player_id)
        }
        return res
    }

    update_elo(game_id, player_id, diff){
        const elo = this.get_or_create_elo(player_id)
        if (diff > 0)
            diff = Math.ceil(diff)
        else
            diff = Math.floor(diff)
        this.conn.run(`
        UPDATE elo
        SET rating = ?
        WHERE player_id = ?
        `, [elo + diff, player_id])
        this.conn.run(`
        INSERT INTO elodiff VALUES(
        ?,
        ?,
        ?
        )`, [game_id, player_id, diff])
    }

    get_result_leaderboard_player_id(top=10){
        return this.conn.all(`
        SELECT player_id, MAX(result)
        FROM gametoplayer
        GROUP BY player_id
        ORDER BY result DESC
        LIMIT ?`, [top])
    }

    get_result_leaderboard_truename(top=10){
        return this.conn.all(`
        SELECT truename, MAX(result)
        FROM player
        JOIN gametoplayer
        ON player_id=id
        GROUP BY player_id
        ORDER BY result DESC
        LIMIT ?`, [top])
    }

    record_game(song_list, players){
        const game_id = this.create_game(len(song_list), len(players))
        let counter = 0
        const song_list_with_ordinal = {}
        for (let i = 0; i < song_list.length; i++){
            const s = song_list[i]
            this.add_song_to_game(game_id, s, counter)
            song_list_with_ordinal["" + s] = counter
            counter += 1
        }
        for (let i = 0; i < players.length; i++){
            const p = players[i]
            const player_id = this.get_or_create_player_id(p.username)
            const correct_songs = p.correct_songs.length
            const missed_songs = p.wrong_songs.length
            let position = 1
            for(let j = 0; j < players.length; j++){
                const p2 = players[j]
                if (p2.correct_songs.length > correct_songs){
                    position += 1
                }
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
                const s = p.correct_songs[j]
                const ordinal = song_list_with_ordinal[s.songinfo+""]
                this.conn.execute(`
                INSERT into gameplayertocorrect VALUES(
                ?,
                ?,
                ?,
                ?
                )`, (game_id, player_id, ordinal, s.answer))
            }
            for(let j = 0; j < p.wrong_songs.length; j++){
                const s = p.wrong_songs[j]
                const ordinal = song_list_with_ordinal[s.songinfo+""]
                this.conn.execute(`
                INSERT into gameplayertomissed VALUES(
                ?,
                ?,
                ?,
                ?
                )`, (game_id, player_id, ordinal, s.answer))
            }
        }
        const player_id_elo_score = []
        for (let i = 0; i < players.length; i++){
            const p = players[i]
            const player_id = this.get_or_create_player_id(p.username)
            const elo = this.get_or_create_elo(player_id)
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


    
    dud(){
        //this does nothing, just keeps errors from destroying the world
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