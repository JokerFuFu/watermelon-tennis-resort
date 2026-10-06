export const GAME_CATEGORIES={all:'全部游戏',puzzle:'方格益智',board:'经典棋类',cards:'常玩牌类',adventure:'探索冒险'} as const
export type GameCategory=Exclude<keyof typeof GAME_CATEGORIES,'all'>
export const ARCADE_GAMES=[
  {id:'survival',name:'荒岛求生',category:'adventure',icon:'🏝️',mode:'单人探索',description:'20 张地图，采集、合成、宝箱与离岛冒险。',rules:['使用方向键或点击相邻地块移动，站到资源上采集。','照顾健康、饥饿、水分和体力，造好木筏后从沙滩离岛。','沿用原来的三个独立存档槽。']},
  {id:'sudoku',name:'数独',category:'puzzle',icon:'🔢',mode:'单人益智',description:'三档难度、笔记和提示，用 1–9 填满九宫格。',rules:['每行、每列和每个 3×3 宫都要恰好包含 1–9。','题面固定数字不能修改；选空格后点数字，笔记模式用于记录候选。','可检查冲突并使用有限提示。']},
  {id:'minesweeper',name:'扫雷',category:'puzzle',icon:'💣',mode:'单人挑战',description:'经典扫雷，首开安全，支持触屏插旗。',rules:['数字表示周围八格的雷数，打开全部无雷格获胜。','右键或开启插旗模式标记雷；插旗本身不代表已找到正确的雷。','首格及附近安全，旗数匹配时可展开相邻格。']},
  {id:'2048',name:'2048',category:'puzzle',icon:'🟨',mode:'单人合成',description:'移动数字方块，合成 2048 后还可继续。',rules:['方向键或方向按钮使所有数字滑向对应边缘。','相同数字相遇合并，一次移动中每个数字最多合并一次。','有效移动才生成新方块，无合法移动时结束。']},
  {id:'fifteen',name:'数字华容道',category:'puzzle',icon:'🧩',mode:'单人拼图',description:'移动空格旁的数字，把 1–15 排回原位。',rules:['点击与空格上下左右相邻的数字移动。','按 1–15 顺序排列，最后一格留空即获胜。','新棋盘由合法移动洗乱，保证可以复原。']},
  {id:'lights',name:'翻灯',category:'puzzle',icon:'💡',mode:'单人益智',description:'点亮与熄灭相邻灯，想办法让全部灯熄灭。',rules:['点击会同时切换自己和上下左右邻格的灯。','让 5×5 棋盘上的所有灯熄灭即获胜。','可以悔一步，尝试不同的开关顺序。']},
  {id:'gomoku',name:'五子棋',category:'board',icon:'⚫',mode:'同屏双人',description:'黑白轮流落子，先连成五个棋子的一方获胜。',rules:['黑方先行，点击空交点落子。','横、竖或斜向连成五个或以上棋子获胜。','采用休闲自由规则；可用“电脑走一步”辅助对局。']},
  {id:'xiangqi',name:'中国象棋',category:'board',icon:'帥',mode:'同屏双人',description:'熟悉的车马炮兵，包含将军和将死判断。',rules:['红方先行，先点棋子再点目标位置。','遵守九宫、象不过河、马腿、炮架和兵过河规则。','不可让自己的将帅受攻击或将帅照面；将死、困毙判负。']},
  {id:'go',name:'围棋',category:'board',icon:'⚪',mode:'同屏双人',description:'9、13、19 路棋盘，围地、提子和休闲数子。',rules:['黑方先行，每个相连棋块至少要有一口气，否则被提掉。','禁止自杀落子和立即打回简单劫；无合适落点可以停一手。','双方连续停一手后按区域与棋子数结算，白方贴 7.5；休闲计分请按页面处理死子。']},
  {id:'chess',name:'国际象棋',category:'board',icon:'♞',mode:'同屏双人',description:'王后车象马兵，支持易位、升变和将死。',rules:['白方先行，点击棋子后选择合法目的格。','王不能处于将军状态；兵可在合适时机吃过路兵、到达底线升变。','王车易位须满足移动权和不穿过受攻击格等条件。将死获胜，无合法走法且未被将军为逼和。']},
  {id:'reversi',name:'黑白棋',category:'board',icon:'◐',mode:'同屏双人',description:'夹住并翻转对方棋子，争取角落与更多棋子。',rules:['落子必须在某方向夹住至少一枚对手棋子。','夹住的棋子翻为自己的颜色。没有合法落点时停一手。','双方都无合法落点时，棋子数量多的一方获胜。']},
  {id:'tictactoe',name:'井字棋',category:'board',icon:'⭕',mode:'同屏双人',description:'三乘三的小棋盘，快速来一局。',rules:['两人轮流在空格放下各自的符号。','横、竖或斜向连成三个获胜。棋盘满且未成线则平局。']},
  {id:'doudizhu',name:'斗地主',category:'cards',icon:'🃏',mode:'单人＋电脑',description:'一位地主与两位农民，选牌、压牌与基础电脑陪玩。',rules:['选择地主阵营，地主拿到底牌，三人轮流出牌。','同牌型同长度用更大的主点数压制；炸弹、火箭可跨牌型。','选中手牌再出牌，也可提示或不出；地主或任一农民出完牌即确定获胜阵营。']},
  {id:'guandan',name:'掼蛋',category:'cards',icon:'♥',mode:'四人搭档·单局',description:'双副牌、级牌与逢人配，和电脑搭档打完一副。',rules:['四人每人 27 张，对家为搭档，采用休闲单局玩法。','红心级牌可在组合中百搭普通牌，单张出牌仍按级牌大小。','支持炸弹、同花顺、连对、钢板等牌型；先出完一方与搭档的名次决定结果。']},
  {id:'solitaire',name:'纸牌接龙',category:'cards',icon:'♠',mode:'单人接龙',description:'经典 Klondike 接龙，红黑交替排列并归入基础堆。',rules:['牌列按红黑交替、点数递减排列；空列只接受 K 或以 K 开始的牌组。','基础堆按同花色 A 到 K 顺序收牌。','每次从牌库翻一张，可回收牌库；四个基础堆都完整时获胜。']},
] as const
export type ArcadeGameId=typeof ARCADE_GAMES[number]['id']
export function readArcadeGame(search:string):ArcadeGameId|'lobby'{const raw=new URLSearchParams(search).get('game');if(!raw||raw==='survival')return 'survival';return ARCADE_GAMES.some(g=>g.id===raw)?raw as ArcadeGameId:'lobby'}
export function arcadeGameURL(href:string,id:ArcadeGameId|'lobby'){const url=new URL(href);if(id==='survival')url.searchParams.delete('game');else url.searchParams.set('game',id);return url.href}
