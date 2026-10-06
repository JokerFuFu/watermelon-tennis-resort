import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Backpack, BookOpen, Check, CheckCircle2, ChevronRight, CircleHelp, Coins, Compass, Diamond, Flag, Gift, Home, Leaf, Lightbulb, Link2, LockKeyhole, ShoppingBag, Shuffle, Sparkles, Star, Trophy, Zap } from 'lucide-react'
import { currentRound, getFactors, ITEMS, MAX_NUMBER, rewardFor, transition, type Action, type GameState, type ItemId } from './engine'
import { loadGame, saveGame } from './storage'
import './factor-game.css'

type Screen = 'play' | 'shop' | 'camp' | 'help'
const itemIcons = { hint: Lightbulb, pair: Link2, random: Shuffle, boost: Zap }
const itemLabels = { hint: '单格提示', pair: '因数配对', random: '随机挑战', boost: '双倍金币' }
const itemSubtitles = { hint: '帮你填好一个空格', pair: '找出一对因数伙伴', random: '给你一个随机数字', boost: '本关金币奖励翻倍' }
const numberFormat = (n: number) => n.toLocaleString('zh-CN')

function Currency({ kind, amount, plus = false }: { kind: 'coins' | 'diamonds'; amount: number; plus?: boolean }) {
  const Icon = kind === 'coins' ? Coins : Diamond
  return <span className={`fq-currency fq-${kind}`}><Icon size={19} aria-hidden="true" /><strong>{plus ? '+' : ''}{numberFormat(amount)}</strong><span>{kind === 'coins' ? '金币' : '钻石'}</span></span>
}

function NumberArt({ number, small = false }: { number: number; small?: boolean }) {
  return <div className={`fq-number-art${small ? ' fq-art-small' : ''}`} aria-hidden="true">
    <svg className="fq-orbit" viewBox="0 0 240 200" fill="none"><path d="M22 98C43 43 119 13 174 39s65 100 10 132S63 181 33 140" stroke="currentColor" strokeWidth="2" strokeDasharray="5 8" /><path d="m181 31 6 13-15-3M34 137l-5 14 15-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    <span className="fq-number-corner fq-corner-a">÷</span><span className="fq-number-corner fq-corner-b">×</span>
    <div className="fq-number-tile"><span style={{ fontSize: number >= 100000 ? '24px' : number >= 10000 ? '29px' : number >= 1000 ? '37px' : number >= 100 ? '48px' : undefined, letterSpacing: number >= 1000 ? '-1px' : undefined }}>{numberFormat(number)}</span><span className="fq-tile-stitch" /></div>
    <Star className="fq-art-star" size={22} fill="currentColor" /><span className="fq-art-dot" />
  </div>
}

function Shop({ game, buy }: { game: GameState; buy: (item: ItemId) => void }) {
  return <section className="fq-shop-page" aria-labelledby="fq-shop-title">
    <div className="fq-section-intro"><div><span className="fq-kicker"><ShoppingBag size={16} />探险补给站</span><h1 id="fq-shop-title">把努力，换成小帮手。</h1><p>金币买道具，钻石换加成。买好后，在关卡右侧背包里使用。</p></div><div className="fq-shop-bag"><ShoppingBag size={52} /><Sparkles size={22} /></div></div>
    <div className="fq-shop-grid">{ITEMS.map(item => {
      const Icon = itemIcons[item.id], affordable = game[item.currency] >= item.cost
      return <article className={`fq-shop-item fq-item-${item.id}`} key={item.id}>
        <div className="fq-shop-item-top"><span className="fq-item-icon"><Icon size={29} strokeWidth={1.8} /></span><span className="fq-owned">已拥有 {game.inventory[item.id]}</span></div>
        <h2>{item.name}</h2><p>{item.description}</p>
        <div className="fq-shop-item-bottom"><Currency kind={item.currency} amount={item.cost} /><button type="button" data-buy={item.id} className="fq-button fq-button-dark" disabled={!affordable} onClick={() => buy(item.id)}>{affordable ? '购买道具' : item.currency === 'coins' ? '金币不足' : '钻石不足'}<ShoppingBag size={16} /></button></div>
      </article>
    })}</div>
    <div className="fq-shop-note"><Gift size={23} /><div><strong>每一关都有收获</strong><p>主线通关就有金币和钻石；每逢第 10、20、30…关，还能多得 2 颗钻石。</p></div></div>
  </section>
}

function Help({ back }: { back: () => void }) {
  return <section className="fq-help-page"><div className="fq-section-intro"><div><span className="fq-kicker"><BookOpen size={16} />探险指南</span><h1>能整除它的，就是因数。</h1><p>从一个小数字开始，慢慢找到所有数字伙伴。</p></div></div>
    <div className="fq-help-example"><div className="fq-example-number">6</div><div><h2>比如，第 6 关需要填 4 格。</h2><p>1、2、3、6 都能整除 6，没有余数，所以它们是 6 的全部正因数。</p><div className="fq-example-pairs"><span>1 × 6 = 6</span><span>2 × 3 = 6</span></div></div></div>
    <div className="fq-help-rules"><article><span>01</span><h2>把空格填满</h2><p>每个正因数只填一次，顺序不限。1 和数字本身也要填；例如 1 只有一个因数，就是 1。</p></article><article><span>02</span><h2>答对，收下奖励</h2><p>检查答案，全部正确就能通关。每关奖励只能领一次；填错可以修改，不扣金币。</p></article><article><span>03</span><h2>继续，或者休息</h2><p>主线从 1 到 100000 逐关递增。退出到营地会保留进度，回到同一浏览器就能接着玩。</p></article></div>
    <div className="fq-tip-box"><Lightbulb size={23} /><div><h3>一个小诀窍</h3><p>因数常常成对出现。找到一个因数 a，就可以用“关卡数字 ÷ a”找它的搭档。完全平方数的平方根只写一次。</p></div></div>
    <button className="fq-button fq-button-primary" onClick={back}>我知道了，去闯关<ArrowRight size={18} /></button>
  </section>
}

export default function FactorGame() {
  const [initial] = useState(loadGame)
  const [game, setGame] = useState(initial.state)
  const gameRef = useRef(game)
  const [screen, setScreen] = useState<Screen>('play')
  const [feedback, setFeedback] = useState({ message: initial.warning, ok: !initial.warning })
  const [invalidIndices, setInvalidIndices] = useState<number[]>([])
  const [saveOk, setSaveOk] = useState(!initial.warning)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const round = currentRound(game), randomMode = game.active === 'random'
  const reward = rewardFor(round.number, randomMode)
  const filled = round.answers.filter(value => value.trim()).length
  const progressStart = Math.max(1, game.campaign.number - 2)
  const roadNumbers = Array.from({ length: Math.min(8, MAX_NUMBER - progressStart + 1) }, (_, i) => progressStart + i)

  useEffect(() => {
    document.title = '因数探险家 · 一起寻找数字的宝藏'
    if (!initial.warning) setSaveOk(saveGame(gameRef.current))
  }, [initial.warning])

  function act(action: Action) {
    const previous = gameRef.current, result = transition(previous, action)
    if (result.state !== previous) {
      gameRef.current = result.state
      setGame(result.state)
      setSaveOk(saveGame(result.state))
    }
    setInvalidIndices(result.invalidIndices)
    setFeedback({ message: result.message, ok: result.ok })
    return result
  }

  function moveTo(next: Screen) { setScreen(next); setFeedback({ message: '', ok: true }); setInvalidIndices([]) }
  function exitToCamp() {
    const state = gameRef.current, activeRound = currentRound(state)
    if (activeRound.cleared && state.active === 'campaign' && activeRound.number < MAX_NUMBER) act({ type: 'next' })
    else if (activeRound.cleared && state.active === 'random') act({ type: 'campaign' })
    moveTo('camp')
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const result = act({ type: 'submit' })
    if (!result.ok && result.invalidIndices.length) inputs.current[result.invalidIndices[0]]?.focus()
  }
  function useItem(item: ItemId) { act({ type: 'use', item, ...(item === 'random' ? { random: Math.random() } : {}) }) }

  return <div className="factor-game" data-factor-game>
    <header className="fq-header"><div className="fq-header-inner">
      <a className="fq-brand" href="/factors" aria-label="因数探险家首页"><span className="fq-brand-mark"><Compass size={28} strokeWidth={1.8} /><span /></span><div><strong>因数探险家</strong><span>发现数字里的小宇宙</span></div></a>
      <nav className="fq-nav" aria-label="游戏导航"><button className={screen === 'play' || screen === 'camp' ? 'fq-nav-active' : ''} onClick={() => moveTo('play')}><Flag size={17} />闯关冒险</button><button className={screen === 'shop' ? 'fq-nav-active' : ''} onClick={() => moveTo('shop')}><ShoppingBag size={17} />道具商店</button><button className={screen === 'help' ? 'fq-nav-active' : ''} onClick={() => moveTo('help')}><CircleHelp size={17} />怎么玩</button></nav>
      <div className="fq-wallet"><Currency kind="coins" amount={game.coins} /><Currency kind="diamonds" amount={game.diamonds} /></div>
    </div></header>

    <main className="fq-main">
      {screen === 'play' && <>
        <div className="fq-play-heading"><div><span className="fq-kicker"><Leaf size={15} />数字探险进行中</span><h1>{randomMode ? '来一场意想不到的挑战。' : '每个数字，都藏着小伙伴。'}</h1><p>{randomMode ? '找齐这个随机数字的因数，主线进度会为你保留。' : '把所有因数填进空格，解锁下一站的数字宝藏。'}</p></div><button className="fq-exit" onClick={exitToCamp}><Home size={17} />退出到营地</button></div>
        <section className="fq-road" aria-label="主线闯关进度"><div className="fq-road-label"><span><Flag size={16} />探险路线</span><strong>已通关 {numberFormat(game.completed)} 关</strong></div><div className="fq-road-stops">{roadNumbers.map(n => <div className={`fq-road-stop${n <= game.completed ? ' fq-stop-done' : n === game.campaign.number ? ' fq-stop-current' : ''}`} key={n} aria-label={`第${n}关，${n <= game.completed ? '已通关' : n === game.campaign.number ? '当前关卡' : '未解锁'}`}><span>{n <= game.completed ? <Check size={18} strokeWidth={3} /> : n === game.campaign.number ? n : <><span>{n}</span><LockKeyhole size={10} /></>}</span>{n === game.campaign.number && <small>你在这里</small>}</div>)}<ChevronRight className="fq-road-more" size={18} /></div></section>

        <div className="fq-game-layout"><section className="fq-board" aria-labelledby="fq-round-title">
          <div className="fq-board-heading"><span className={`fq-level-label${randomMode ? ' fq-random-label' : ''}`}>{randomMode ? <Shuffle size={15} /> : <Flag size={15} />}{randomMode ? '随机挑战' : `第 ${numberFormat(round.number)} 关`}</span><span className="fq-round-kind">{getFactors(round.number).length === 2 ? '质数伙伴' : Number.isInteger(Math.sqrt(round.number)) ? '平方数伙伴' : '数字伙伴'}<Sparkles size={14} /></span></div>
          <div className="fq-puzzle-intro"><NumberArt number={round.number} /><div><h2 id="fq-round-title">找到 <strong>{numberFormat(round.number)}</strong> 的所有因数</h2><p>共有 <strong>{round.answers.length}</strong> 个正因数，每个因数填一次。</p><span className="fq-order-note"><CheckCircle2 size={14} />顺序不限，包含 1 和它自己</span></div></div>
          <form onSubmit={submit} noValidate>
            <div className="fq-answer-heading"><h3>你的答案</h3><span>{filled} / {round.answers.length} 已填写</span></div>
            <div className="fq-factor-grid">{round.answers.map((answer, index) => {
              const revealed = round.revealed.includes(index), invalid = invalidIndices.includes(index)
              return <label className={`fq-factor-slot${revealed ? ' fq-slot-revealed' : ''}${invalid ? ' fq-slot-invalid' : ''}${round.cleared ? ' fq-slot-correct' : ''}`} key={`${game.active}-${round.number}-${index}`}>
                <span className="fq-slot-label">{revealed ? <Lightbulb size={12} /> : round.cleared ? <Check size={12} /> : String(index + 1).padStart(2, '0')}</span>
                <input ref={el => { inputs.current[index] = el }} className="fq-factor-input" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="?" aria-label={`第 ${index + 1} 个因数`} aria-invalid={invalid} aria-describedby={invalid ? 'fq-answer-feedback' : undefined} disabled={revealed || round.cleared} autoComplete="off" value={answer} onChange={event => act({ type: 'answer', index, value: event.target.value })} />
              </label>
            })}</div>
            {!round.cleared && <div className="fq-answer-actions"><span><Lightbulb size={15} />想一想：哪些数能把它整除？</span><button className="fq-button fq-button-primary" type="submit">检查答案<ArrowRight size={18} /></button></div>}
          </form>
          {feedback.message && screen === 'play' && <div id="fq-answer-feedback" role={feedback.ok ? 'status' : 'alert'} className={`fq-feedback${feedback.ok ? ' fq-feedback-good' : ''}`}>{feedback.ok ? <CheckCircle2 size={18} /> : <CircleHelp size={18} />}<span>{feedback.message}</span></div>}
          {round.cleared && <section className="fq-win" aria-label="通关奖励"><div className="fq-win-icon"><Trophy size={29} /></div><div className="fq-win-copy"><h3>{round.number === MAX_NUMBER && !randomMode ? '主线全部通关，了不起！' : '找齐啦！宝藏是你的。'}</h3><p>奖励已领取，可以继续探险，也可以先休息一下。</p><div className="fq-win-rewards"><Currency kind="coins" amount={reward.coins * (round.boosted ? 2 : 1)} plus /><Currency kind="diamonds" amount={reward.diamonds} plus /></div></div><div className="fq-win-buttons">{randomMode ? <button className="fq-button fq-button-dark" onClick={() => act({ type: 'campaign' })}>回到主线<ArrowRight size={17} /></button> : round.number < MAX_NUMBER && <button className="fq-button fq-button-dark" onClick={() => act({ type: 'next' })}>继续下一关<ArrowRight size={17} /></button>}<button className="fq-text-button" onClick={exitToCamp}>退出到营地</button></div></section>}
          {randomMode && !round.cleared && <button className="fq-back-campaign" onClick={() => act({ type: 'campaign' })}><ArrowLeft size={15} />暂存挑战，回到主线</button>}
        </section>

        <aside className="fq-side">
          <section className="fq-reward-card"><span className="fq-side-title"><Gift size={18} />{round.cleared ? '这关的收获' : '这关的宝藏'}</span><div className="fq-reward-values"><Currency kind="coins" amount={reward.coins * (round.boosted ? 2 : 1)} plus /><Currency kind="diamonds" amount={reward.diamonds} plus /></div><p>{round.boosted ? '双倍金币已激活，这关奖励翻倍！' : '填齐所有因数，就能把它们带走。'}</p><Star className="fq-reward-star" size={45} strokeWidth={1.2} /></section>
          <section className="fq-backpack"><div className="fq-backpack-title"><span className="fq-side-title"><Backpack size={18} />我的背包</span><button onClick={() => moveTo('shop')} aria-label="去商店补充道具"><ShoppingBag size={16} /></button></div><div className="fq-inventory">{ITEMS.map(item => { const Icon = itemIcons[item.id], quantity = game.inventory[item.id], disabled = quantity === 0 || (round.cleared && item.id !== 'random') || (item.id === 'boost' && round.boosted)
            return <button key={item.id} data-use={item.id} title={`${item.description}；已拥有 ${quantity} 个`} className={`fq-inventory-item fq-item-${item.id}`} disabled={disabled} onClick={() => useItem(item.id)}><span className="fq-item-icon"><Icon size={19} /></span><span><strong>{itemLabels[item.id]}</strong><small>{item.id === 'boost' && round.boosted ? '本关已激活' : itemSubtitles[item.id]}</small></span><b>×{quantity}</b></button>
          })}</div><button className="fq-shop-link" onClick={() => moveTo('shop')}>去商店补充道具<ArrowRight size={15} /></button>{game.challenge && game.active === 'campaign' && !game.challenge.cleared && <button className="fq-resume-random" onClick={() => act({ type: 'resumeRandom' })}><Shuffle size={14} />继续数字 {game.challenge.number} 的随机挑战</button>}</section>
          <div className="fq-small-tip"><BookOpen size={20} /><div><strong>因数总是成双成对？</strong><p>找到一个因数，试着用除法找出它的搭档。</p><button onClick={() => moveTo('help')}>看看小诀窍<ChevronRight size={14} /></button></div></div>
        </aside></div>
      </>}

      {screen === 'shop' && <Shop game={game} buy={item => act({ type: 'buy', item })} />}
      {screen === 'help' && <Help back={() => moveTo('play')} />}
      {screen === 'camp' && <section className="fq-camp"><div className="fq-camp-art"><NumberArt number={game.campaign.number} /><span className="fq-camp-flag"><Flag size={28} /></span></div><span className="fq-kicker"><Home size={16} />回到探险营地</span><h1>休息一下，下一站再出发。</h1><p>你已经通关 <strong>{numberFormat(game.completed)}</strong> 关。金币、钻石和填写中的答案都为你保留。</p><div className="fq-camp-stats"><span><Trophy size={19} /><b>{numberFormat(game.completed)}</b> 已通关</span><span><Flag size={19} /><b>{numberFormat(game.campaign.number)}</b> 当前关卡</span></div><div className="fq-camp-actions"><button className="fq-button fq-button-primary" onClick={() => moveTo('play')}>继续冒险<ArrowRight size={18} /></button><button className="fq-button fq-button-outline" onClick={() => moveTo('shop')}><ShoppingBag size={18} />逛逛商店</button></div><p className="fq-camp-close">现在可以关闭网页，下次打开这里接着玩。</p></section>}

      {screen !== 'play' && feedback.message && <div className={`fq-feedback fq-page-feedback${feedback.ok ? ' fq-feedback-good' : ''}`} role={feedback.ok ? 'status' : 'alert'}>{feedback.ok ? <CheckCircle2 size={18} /> : <CircleHelp size={18} />}<span>{feedback.message}</span></div>}
    </main>
    <footer className="fq-footer"><span><Compass size={15} />一步一个数字，一关一份收获。</span><span className={saveOk ? 'fq-save-status' : 'fq-save-status fq-save-error'}>{saveOk ? <CheckCircle2 size={14} /> : <CircleHelp size={14} />}{saveOk ? '进度已自动保存在此浏览器' : '自动保存不可用，请保持页面打开'}</span></footer>
  </div>
}
