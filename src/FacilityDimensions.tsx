import { measureFacility, measureGap, formatLength } from './layoutMeasurements'
import type { Facility, Project } from './types'
type Point=[number,number]
export default function FacilityDimensions({facilities,project,projectPoint}:{facilities:Facility[];project:Project;projectPoint:(x:number,y:number,z?:number)=>Point}){
  function label(point:Point,text:string){const width=Math.max(35,text.length*4.8+9);return <g transform={`translate(${point[0]} ${point[1]})`} stroke="none"><rect x={-width/2} y={-7} width={width} height={14} rx={3} fill="#fffdf4" stroke="#a7b785" strokeWidth=".6"/><text textAnchor="middle" y={2.8} fontSize={8} fontFamily="Arial, PingFang SC, sans-serif" fill="#647f45">{text}</text></g>}
  const shown=facilities.filter(f=>f.visible!==false)
  return <g pointerEvents="none" aria-hidden="true" data-measure-overlay="true">
    {shown.slice(0,8).map(f=>{const m=measureFacility(f,project),p=projectPoint
      const w1=p(m.x,m.bottom+4),w2=p(m.right,m.bottom+4),d1=p(m.right+4,m.y),d2=p(m.right+4,m.bottom)
      return <g key={f.id} data-measure-facility={f.id} stroke="#7b9954" strokeWidth=".8" fill="none">
        <line x1={w1[0]} y1={w1[1]} x2={w2[0]} y2={w2[1]}/><line x1={d1[0]} y1={d1[1]} x2={d2[0]} y2={d2[1]}/>
        {[p(m.x,m.bottom),p(m.right,m.bottom)].map((q,i)=><line key={`w${i}`} x1={q[0]} y1={q[1]} x2={(i?w2:w1)[0]} y2={(i?w2:w1)[1]} strokeDasharray="2 2"/>)}
        {[p(m.right,m.y),p(m.right,m.bottom)].map((q,i)=><line key={`d${i}`} x1={q[0]} y1={q[1]} x2={(i?d2:d1)[0]} y2={(i?d2:d1)[1]} strokeDasharray="2 2"/>)}
        {[w1,w2,d1,d2].map((q,i)=><circle key={i} cx={q[0]} cy={q[1]} r={1.25} fill="#7b9954" stroke="none"/>)}
        <g data-measure-dimension="width">{label(p((m.x+m.right)/2,m.bottom+4),formatLength(m.width)+' m')}</g>
        <g data-measure-dimension="depth">{label(p(m.right+4,m.y+m.depth*.25),formatLength(m.depth)+' m')}</g>
      </g>
    })}
    {shown.length===2&&(()=>{const a=measureFacility(shown[0],project),b=measureFacility(shown[1],project),gap=measureGap(a,b),from=projectPoint(...gap.from),to=projectPoint(...gap.to)
      return <g data-measure-gap="true"><line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#b88955" strokeWidth="1" strokeDasharray="3 2"/>{label([(from[0]+to[0])/2,(from[1]+to[1])/2-34],gap.relation==='overlap'?'占地重叠':gap.relation==='touching'?'边界接触':'净距 '+formatLength(gap.distance)+' m')}</g>
    })()}
  </g>
}
