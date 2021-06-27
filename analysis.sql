drop table if exists song_count_temp; -- correct
create table song_count_temp(player_id integer, song_id integer);
INSERT INTO song_count_temp select player_id, song_id from player natural join gameplayer natural join game natural join gamesong;

drop table if exists song_count; --correct
create table song_count(player_id integer, song_id integer, count integer);
insert into song_count select player_id, song_id, count(*) from song_count_temp group by player_id, song_id;

drop table if exists temp_result_count; --correct
create table temp_result_count (player_id integer, result integer, count integer);
insert into temp_result_count select player_id, result, count(*) from player natural join gameplayer group by player_id, result;

drop table if exists max_result; --correct
create table max_result (player_id integer, result integer);
insert into max_result select player_id, max(result) from temp_result_count  group by player_id;



drop table if exists temp_10th;
drop table if exists temp_20th;
drop table if exists temp_30th;
drop table if exists temp_40th;
drop table if exists temp_50th;
drop table if exists temp_60th;
drop table if exists temp_70th;
drop table if exists temp_80th;
drop table if exists temp_90th;
drop table if exists temp_100th;

create table temp_10th (player_id integer, count10 integer);
create table temp_20th (player_id integer, count20 integer);
create table temp_30th (player_id integer, count30 integer);
create table temp_40th (player_id integer, count40 integer);
create table temp_50th (player_id integer, count50 integer);
create table temp_60th (player_id integer, count60 integer);
create table temp_70th (player_id integer, count70 integer);
create table temp_80th (player_id integer, count80 integer);
create table temp_90th (player_id integer, count90 integer);
create table temp_100th (player_id integer, count100 integer);

insert into temp_10th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0 and 0.09999
group by a.player_id;
insert into temp_20th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.1 and 0.19999
group by a.player_id;
insert into temp_30th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.2 and 0.29999
group by a.player_id;
insert into temp_40th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.3 and 0.39999
group by a.player_id;
insert into temp_50th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.4 and 0.49999
group by a.player_id;
insert into temp_60th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.5 and 0.59999
group by a.player_id;
insert into temp_70th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.6 and 0.69999
group by a.player_id;
insert into temp_80th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.7 and 0.79999
group by a.player_id;
insert into temp_90th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.8 and 0.89999
group by a.player_id;
insert into temp_100th select a.player_id, SUM(a.count) from temp_result_count a inner join max_result b on a.player_id = b.player_id 
where 1.0*a.result/b.result BETWEEN 0.9 and 1
group by a.player_id;


insert into temp_10th select player_id, 0 from max_result where player_id not in (select player_id from temp_10th);
insert into temp_20th select player_id, 0 from max_result where player_id not in (select player_id from temp_20th);
insert into temp_30th select player_id, 0 from max_result where player_id not in (select player_id from temp_30th);
insert into temp_40th select player_id, 0 from max_result where player_id not in (select player_id from temp_40th);
insert into temp_50th select player_id, 0 from max_result where player_id not in (select player_id from temp_50th);
insert into temp_60th select player_id, 0 from max_result where player_id not in (select player_id from temp_60th);
insert into temp_70th select player_id, 0 from max_result where player_id not in (select player_id from temp_70th);
insert into temp_80th select player_id, 0 from max_result where player_id not in (select player_id from temp_80th);
insert into temp_90th select player_id, 0 from max_result where player_id not in (select player_id from temp_90th);
insert into temp_100th select player_id, 0 from max_result where player_id not in (select player_id from temp_100th);


drop table if exists total_score;
create table total_score (player_id, total_score);
insert into total_score select player_id, sum(result) from gameplayer group by player_id;


drop table if exists total_games;
create table total_games (player_id, total_games);
insert into total_games select player_id, count(*) from gameplayer group by player_id;



drop table if exists score_distribution;
create table score_distribution (player_id integer, max_result integer, total_games integer, total_score integer, '[0-10>' integer, '[10-20>' integer,'[20-30>' integer,'[30-40>' integer,'[40-50>' integer,'[50-60>' integer,'[60-70>' integer,'[70-80>' integer,'[80-90>' integer,'[90-100]' integer);
insert into score_distribution
select max_result.player_id, max_result.result, total_games, total_score, count10, count20, count30, count40, count50, count60, count70, count80, count90, count100

from max_result 
natural join total_score 
natural join total_games 
natural join temp_10th 
natural join temp_20th 
natural join temp_30th 
natural join temp_40th 
natural join temp_50th 
natural join temp_60th 
natural join temp_70th 
natural join temp_80th 
natural join temp_90th 
natural join temp_100th 
;

drop table if exists score_distribution_percent;
create table score_distribution_percent (truename text, max_result integer, total_games integer, '%[0-10>' REAL, '%[10-20>' REAL,'%[20-30>' REAL,'%[30-40>' REAL,'%[40-50>' REAL,'%[50-60>' REAL,'%[60-70>' REAL,'%[70-80>' REAL,'%[80-90>' REAL,'%[90-100]' REAL);


insert into score_distribution_percent select truename, max_result, total_games, 100.0*"[0-10>"/total_games,100.0*"[10-20>"/total_games,100.0*"[20-30>"/total_games,100.0*"[30-40>"/total_games,100.0*"[40-50>"/total_games,100.0*"[50-60>"/total_games,100.0*"[60-70>"/total_games,100.0*"[70-80>"/total_games,100.0*"[80-90>"/total_games,100.0*"[90-100]"/total_games from score_distribution natural join player order by max_result desc