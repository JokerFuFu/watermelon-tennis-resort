import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import StartupBoundary from './StartupBoundary'
import './styles.css'
import './desktop-web.css'
import './watermelon-theme.css'
const App=lazy(()=>import('./App'))
const ArcadeRouter=lazy(()=>import('./arcade/ArcadeRouter'))
const FactorGame=lazy(()=>import('./factors/FactorGame'))
const pathname=window.location.pathname.replace(/\/$/,'')
const guest=pathname==='/play'
const factors=pathname==='/factors'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><StartupBoundary><Suspense fallback={<main className="workspace-loading" role="status">{factors?'正在打开因数探险家…':guest?'正在打开顾客游戏…':'正在打开酒店设计工作台…'}</main>}>{factors?<FactorGame/>:guest?<ArcadeRouter/>:<App/>}</Suspense></StartupBoundary></React.StrictMode>)
