import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from './types'
import { createDefaultProject, parseProject } from './model'

const STORAGE_KEY = 'courtside-projects-v1'
const ACTIVE_KEY = 'courtside-active-v1'
const CORRUPT_ERROR = '原有本地方案无法读取。已载入示例，原始存储保留到你点击保存。'
const CONFLICT_ERROR = '另一页面已更新此方案。当前编辑已保留；点击保存将备份另一页面的版本，或另存为新方案。'
type History = { past: Project[]; present: Project; future: Project[] }
const serialize = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
  }
  return item
})
const content = (project: Project) => serialize({ ...project, updatedAt: '' })

function parseLibrary(raw: string | null): Project[] {
  if (raw === null) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('方案列表为空')
  const projects = parsed.map(p => parseProject(JSON.stringify(p)))
  if (new Set(projects.map(p => p.id)).size !== projects.length) throw new Error('方案 ID 重复')
  return projects
}

function migrate(project: Project): Project {
  const name = project.name === '青屿网球度假酒店' ? '西瓜网球度假酒店' : project.name
  const location = project.location === '杭州 · 概念方案' ? '北京 · 概念方案' : project.location
  return name !== project.name || location !== project.location ? { ...project, name, location } : project
}

function readInitial() {
  let persisted: Project[] = []
  let error: string | null = null
  try { persisted = parseLibrary(localStorage.getItem(STORAGE_KEY)) } catch { error = CORRUPT_ERROR }
  const projects = persisted.length ? persisted.map(migrate) : [createDefaultProject()]
  let active: string | null = null
  try { active = localStorage.getItem(ACTIVE_KEY) } catch { /* The project library may still be readable. */ }
  const present = projects.find(p => p.id === active) ?? projects[0]
  return { projects, present, persisted: persisted.find(p => p.id === present.id) ?? null, error }
}

export function useProject() {
  const [initial] = useState(readInitial)
  const [projects, setProjects] = useState(initial.projects)
  const [history, setHistory] = useState<History>({ past: [], present: initial.present, future: [] })
  const [storageError, setStorageError] = useState(initial.error)
  const [persistedDigest, setPersistedDigest] = useState(initial.persisted ? serialize(initial.persisted) : null)
  // These refs are authoritative even when several actions run before React renders.
  const historyRef = useRef(history)
  const projectsRef = useRef(projects)
  const persistedRef = useRef<Project | null>(initial.persisted)
  const protectedStorage = useRef(!!initial.error)
  const conflictRef = useRef(false)

  const updateLibrary = useCallback((list: Project[]) => {
    projectsRef.current = list
    setProjects(list)
  }, [])
  const updateHistory = useCallback((next: History) => {
    historyRef.current = next
    setHistory(next)
  }, [])
  const recordPersisted = useCallback((project: Project | null) => {
    persistedRef.current = project
    setPersistedDigest(project ? serialize(project) : null)
  }, [])

  const getCurrentProject=useCallback(()=>structuredClone(historyRef.current.present),[])

  const change = useCallback((edit: (current: Project) => Project) => {
    const h = historyRef.current
    const next = edit(structuredClone(h.present))
    if (serialize(next) === serialize(h.present)) return
    next.updatedAt = new Date().toISOString()
    updateHistory({ past: [...h.past.slice(-59), h.present], present: next, future: [] })
  }, [updateHistory])
  const undo = useCallback(() => {
    const h = historyRef.current
    if (h.past.length) updateHistory({ past: h.past.slice(0, -1), present: { ...h.past[h.past.length - 1], updatedAt: new Date().toISOString() }, future: [h.present, ...h.future] })
  }, [updateHistory])
  const redo = useCallback(() => {
    const h = historyRef.current
    if (h.future.length) updateHistory({ past: [...h.past.slice(-59), h.present], present: { ...h.future[0], updatedAt: new Date().toISOString() }, future: h.future.slice(1) })
  }, [updateHistory])

  const save = useCallback((explicit = false): boolean => {
    if ((protectedStorage.current || conflictRef.current) && !explicit) return false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      let latest: Project[]
      try { latest = parseLibrary(raw) } catch {
        protectedStorage.current = true
        if (!explicit) {
          setStorageError('本地方案列表无法读取，原始存储已保留。请导出当前方案，或点击保存覆盖不可读的列表。')
          return false
        }
        latest = projectsRef.current
      }
      const current = historyRef.current.present
      const remote = latest.find(p => p.id === current.id)
      const baseline = persistedRef.current
      const remoteChanged = !!remote && (!baseline || content(remote) !== content(baseline)) && content(remote) !== content(current)
      if (remoteChanged && !explicit) {
        conflictRef.current = true
        setStorageError(CONFLICT_ERROR)
        updateLibrary(latest)
        return false
      }
      // A manual save retains the competing version under a fresh identity.
      if (remoteChanged && remote) {
        const suffix = ' · 冲突备份'
        latest = [...latest, { ...structuredClone(remote), id: crypto.randomUUID(), name: `${remote.name.slice(0, 120 - suffix.length)}${suffix}`, updatedAt: new Date().toISOString() }]
      }
      const updated = latest.some(p => p.id === current.id)
        ? latest.map(p => p.id === current.id ? current : p)
        : [...latest, current]
      const serialized = serialize(updated)
      if (raw !== serialized) {
        let unchanged = false
        try { unchanged = raw !== null && serialize(JSON.parse(raw)) === serialized } catch { /* Explicit recovery replaces unreadable data. */ }
        if (!unchanged) localStorage.setItem(STORAGE_KEY, serialized)
      }
      recordPersisted(current)
      updateLibrary(updated)
      protectedStorage.current = false
      conflictRef.current = false
      setStorageError(null)
      // An active-key failure cannot undo a successful project-library write.
      try {
        if (localStorage.getItem(ACTIVE_KEY) !== current.id) localStorage.setItem(ACTIVE_KEY, current.id)
      } catch { setStorageError('方案已保存，但无法记住当前打开的方案。') }
      return true
    } catch {
      setStorageError('浏览器存储不可用，请导出 JSON 保留当前方案。')
      return false
    }
  }, [recordPersisted, updateLibrary])

  useEffect(() => { save() }, [history.present, save])

  useEffect(() => {
    function receive(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      try {
        if (event.storageArea && event.storageArea !== localStorage) return
        // Read the latest value: a queued event may already describe an older version.
        const latest = parseLibrary(localStorage.getItem(STORAGE_KEY))
        updateLibrary(latest)
        const current = historyRef.current.present
        const remote = latest.find(p => p.id === current.id)
        if (!remote) {
          conflictRef.current = true
          setStorageError('另一页面移除了当前方案。当前编辑已保留，点击保存可重新保存此方案。')
          return
        }
        if (serialize(remote) === serialize(current)) {
          recordPersisted(remote)
          conflictRef.current = false
          if (!protectedStorage.current) setStorageError(null)
          return
        }
        const baseline = persistedRef.current
        if (baseline && serialize(remote) === serialize(baseline)) return
        const locallySaved = !!baseline && serialize(current) === serialize(baseline)
        if (locallySaved && (!baseline || Date.parse(remote.updatedAt) >= Date.parse(baseline.updatedAt))) {
          recordPersisted(remote)
          conflictRef.current = false
          if (!protectedStorage.current) setStorageError(null)
          updateHistory({ past: [], present: migrate(remote), future: [] })
        } else if (content(remote) !== content(current) && (!baseline || content(remote) !== content(baseline))) {
          conflictRef.current = true
          setStorageError(CONFLICT_ERROR)
        }
      } catch {
        protectedStorage.current = true
        setStorageError('另一页面的本地方案列表无法读取。当前编辑和原始存储已保留，请导出方案备份。')
      }
    }
    window.addEventListener('storage', receive)
    return () => window.removeEventListener('storage', receive)
  }, [recordPersisted, updateHistory, updateLibrary])

  const open = useCallback((project: Project): boolean => {
    const current = historyRef.current.present
    if (project.id === current.id) return true
    const oldSaved = save()
    const cloneContent = (p: Project) => serialize({ ...p, id: '', name: '', updatedAt: '' })
    const safeConflictClone = conflictRef.current && !protectedStorage.current && cloneContent(project) === cloneContent(current)
    if (!oldSaved && !safeConflictClone) return false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const latest = parseLibrary(raw)
      const existing = latest.find(p => p.id === project.id)
      // A conflict may be resolved by a new-ID copy, never by switching to another stored project.
      if (!oldSaved && existing) return false
      const next = migrate(structuredClone(existing ?? project))
      const updated = existing ? latest.map(p => p.id === next.id ? next : p) : [...latest, next]
      const serialized = serialize(updated)
      if (raw === null || serialize(JSON.parse(raw)) !== serialized) localStorage.setItem(STORAGE_KEY, serialized)
      // Commit the switch only after persistence succeeds, including new imports and copies.
      updateLibrary(updated)
      recordPersisted(next)
      conflictRef.current = false
      updateHistory({ past: [], present: next, future: [] })
      setStorageError(null)
      try {
        if (localStorage.getItem(ACTIVE_KEY) !== next.id) localStorage.setItem(ACTIVE_KEY, next.id)
      } catch { setStorageError('方案已保存，但无法记住当前打开的方案。') }
      return true
    } catch {
      setStorageError('无法保存或读取本地方案列表，当前方案仍然保留。请导出 JSON 保留方案。')
      return false
    }
  }, [save, recordPersisted, updateHistory, updateLibrary])

  const saved = !protectedStorage.current && !conflictRef.current && persistedDigest === serialize(history.present)
  return { project: history.present, projects, getCurrentProject, change, undo, redo, canUndo: !!history.past.length, canRedo: !!history.future.length, save, saved, storageError, open }
}
