import { Copy, Grid2X2, Layers, MousePointer2, Sparkles } from 'lucide-react'
import { Modal } from './ui'
import './version-updates.css'

const releases = [
  {version:'6.3.1',title:'Windows 与 Mac 通用 Web 运行',current:true,items:['新增跨平台网页服务与双击启动器，保留原本机地址和浏览器数据。','可下载已构建运行包，只需 Node.js 22 或更高版本。','公开源码与三系统自动构建检查，运行包不包含个人方案和存档。']},
  {version:'6.3',title:'十项设计效率改进',items:['设施按名称、占地或工程估算排序；按显示与锁定状态筛选。','一键重置筛选与排序，反选当前结果，查看匹配面积、客房和工程估算。','批量隐藏或显示匹配设施，可一次撤销。','设计页支持 Ctrl / ⌘ + A 选择显示设施、Ctrl / ⌘ + D 复制选区，输入与弹窗中不拦截。','测量清单支持排序，CSV沿用当前筛选及顺序；组合库支持建立独立副本。']},
  { version:'6.2', title:'自己的设施组合库', items:['把当前选区保存为常用组合，保留内部布局、房型与原报价。','支持命名、搜索、重命名、JSON导入导出与独立备份。','预览后整套放入其他方案，自动避让原布局和建材，可一次撤销。'] },
  { version: '6.1', title: '布局测量与清单', items: ['为选中设施标注旋转后的占地宽深，显示两设施矩形净距。', '查看四边用地边距、越界与最近设施；清单支持筛选、搜索和CSV导出。', '后台服务持续运行，保留酒店方案、经营设置和15款游戏的独立存档。'] },
  { version: '6.0', title: '顾客游戏大厅', items: ['新增数独、扫雷、2048、数字华容道和翻灯。', '五子棋、象棋、围棋、国际象棋、黑白棋和井字棋，支持同屏对局。', '斗地主、掼蛋与纸牌接龙，提供独立存档及基础电脑陪玩。', '荒岛求生继续沿用原地图和三个存档槽。'] },
  { version: '5.0', title: '更快搭建一整片酒店空间', items: ['8 套功能区组合：网球、住宿、亲子、康养、餐饮、棋牌、商务与后勤。', '阵列复制：设置行列与间距，先预览布局、面积和新增设施工程估算。', '适应选区：一键放大查看所选设施，2D 和 3D 均可使用。'] },
  { version: '4.2', title: '多个设施一起编辑', items: ['Shift 多选、整组拖动、六种对齐与均匀排列。', '批量复制、锁定、隐藏和删除；删除同步清理设施收费。'] },
  { version: '4.1', title: '20 张荒岛地图', items: ['新增 17 张荒岛地图，地图卡片可以预览地形。', '顾客游戏与酒店方案使用独立存档。'] },
  { version: '3.1', title: '逐月经营与回本', items: ['连续 12 个自然月的房价、入住率、营业天数及设施收费。', '年度经营明细、累计现金回收和预计首次回本年月。'] },
  { version: '2.8', title: '建材与自建作品', items: ['33 种建材与自定义构件，支持叠放、组合及旋转。', '建材采购预算可选择是否计入，单独导出清单。'] },
]

export default function VersionUpdates({ onClose }: { onClose: () => void }) {
  return <Modal title="版本更新与新功能" onClose={onClose} wide><div className="version-updates">
    <div className="vu-intro"><span><Sparkles size={24}/></span><div><small>西瓜网球度假酒店 · 6.2</small><h3>从一件设施，到一整套空间。</h3><p>新工具让布局更快完成，原有方案继续编辑。</p></div></div>
    <div className="vu-feature-icons"><span><Layers size={16}/>功能区组合</span><span><Copy size={16}/>阵列复制</span><span><MousePointer2 size={16}/>查看选区</span><span><Grid2X2 size={16}/>预览后加入</span></div>
    <div className="vu-releases">{releases.map(r => <section className={r.current ? 'vu-current' : ''} key={r.version}><div className="vu-release-heading"><span>{r.version}</span><h3>{r.title}</h3>{r.current && <small>当前版本</small>}</div><ul>{r.items.map(item => <li key={item}>{item}</li>)}</ul></section>)}</div>
    <p className="vu-note">用地与设施尺寸、报价、经营设置沿用当前方案。新功能区的初始单价为可修改示例；复制的设施收费可在月度经营中另设。方案文件版本仍为 1。</p>
    <div className="dialog-footer"><span>更新说明可随时从顶部导出菜单打开。</span><button className="button primary" onClick={onClose}>知道了</button></div>
  </div></Modal>
}
