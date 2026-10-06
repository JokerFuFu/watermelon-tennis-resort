export const WORKSPACE_PAGES=['design','rooms','budget','earnings','overview','play'] as const
export type WorkspacePage=typeof WORKSPACE_PAGES[number]

export function readWorkspacePage(search:string):WorkspacePage{
  const value=new URLSearchParams(search).get('section')
  return WORKSPACE_PAGES.includes(value as WorkspacePage)?value as WorkspacePage:'design'
}
export function workspacePageURL(href:string,page:WorkspacePage):string{
  const url=new URL(href)
  url.searchParams.set('section',page)
  return url.href
}
