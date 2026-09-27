import { Link, useNavigate } from 'react-router-dom'
import { daysBetween, fmtDate, round, today } from '@shared/util'
import { useApp } from '../App'
import { FlagChips, FormChip, Panel, Stat } from '../components/ui'

export function RosterPage() {
  const { athletes } = useApp()
  const nav = useNavigate()
  const list = athletes ?? []
  const attention = list.filter((a) => a.flags.some((f) => !/Fris/.test(f)))
  const avgCtl = list.length ? round(list.reduce((s, a) => s + a.ctl, 0) / list.length) : 0

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <div className="eyebrow">Coachoverzicht</div>
          <h1 className="text-[26px] font-semibold tracking-tight m-0 mt-1">Je atleten</h1>
        </div>
        <Link to="/koppelen" className="btn ml-auto no-underline">
          + Atleet koppelen
        </Link>
      </header>

      <div className="panel grid grid-cols-2 md:grid-cols-4 gap-6 p-4">
        <Stat label="Atleten" value={list.length} />
        <Stat label="Vragen aandacht" value={attention.length} tone={attention.length ? 'text-warn' : ''} />
        <Stat label="Gem. fitness" value={avgCtl} unit="CTL" />
        <Stat label="Overbelast" value={list.filter((a) => a.tsb < -30).length} tone={list.some((a) => a.tsb < -30) ? 'text-crit' : ''} sub="vorm onder −30" />
      </div>

      <Panel title="Status per atleet" pad={false}>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Atleet</th>
                <th className="text-right">Fitness</th>
                <th className="text-right">Vermoeid.</th>
                <th className="text-right">Vorm</th>
                <th></th>
                <th className="text-right">Ramp</th>
                <th className="text-right">CP</th>
                <th className="text-right">W′</th>
                <th>Laatste rit</th>
                <th>Aandacht</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="cursor-pointer" onClick={() => nav(`/atleet/${a.id}`)}>
                  <td>
                    <Link to={`/atleet/${a.id}`} className="text-ink font-medium no-underline hover:underline">
                      {a.name}
                    </Link>
                    <div className="text-[11.5px] text-muted truncate max-w-[220px]">{a.goal ?? (a.source === 'demo' ? 'demo' : 'intervals.icu')}</div>
                  </td>
                  <td className="num text-right">{round(a.ctl)}</td>
                  <td className="num text-right">{round(a.atl)}</td>
                  <td className="num text-right">{a.tsb > 0 ? '+' : ''}{round(a.tsb)}</td>
                  <td>
                    <FormChip tsb={a.tsb} />
                  </td>
                  <td className={`num text-right ${a.rampRate > 8 ? 'text-warn' : ''}`}>{a.rampRate > 0 ? '+' : ''}{a.rampRate}</td>
                  <td className="num text-right">{a.cp ?? '–'}</td>
                  <td className="num text-right">{a.wPrime ? `${round(a.wPrime / 1000, 1)}k` : '–'}</td>
                  <td className="text-ink-2">{a.lastActivity ? (daysBetween(a.lastActivity, today()) === 0 ? 'vandaag' : fmtDate(a.lastActivity)) : '–'}</td>
                  <td>
                    <FlagChips flags={a.flags} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {athletes && !list.length && (
          <div className="p-8 text-center text-muted">
            Nog geen atleten. <Link to="/koppelen">Koppel de eerste via intervals.icu</Link>.
          </div>
        )}
      </Panel>
    </div>
  )
}
