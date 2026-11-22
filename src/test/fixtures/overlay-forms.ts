/** Production forms and hosts. Only Home data, mutations and the unrelated builder chat are synthetic. */
import { browserFixture } from './browser-fixture';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function overlayFormsFixture(
  options: {
    builder?: boolean;
    baselineShell?: boolean;
    baselinePicker?: boolean;
  } = {},
) {
  return browserFixture(
    `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';
    import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
    import{TipProvider}from'@/components/ui/tip';
    import{Dialog}from'@/components/ui/dialog';
    import{SettingsPanel}from'@/components/settings/settings-panel';
    import{WorkspaceCreateModal}from'@/components/workspaces/workspace-create-modal';
    import{ReferenceFolderDialog}from'@/components/workspaces/reference-folder-dialog';
    import{McpServerForm}from'@/components/settings/sections/integrations/mcp-server-detail';
    import{ConnectPanel}from'@/components/settings/sections/integrations/provider-detail';
    import{EMPTY_MCP_FORM}from'@/components/settings/sections/integrations/types';
    import{TriggersModal}from'@/components/triggers/triggers-modal';
    import{openSchedulesWindow}from'@/lib/client/schedules-window';
    const params=new URLSearchParams(location.search),surface=params.get('surface');
    document.documentElement.classList.toggle('dark',params.get('theme')==='dark');window.fixtureCalls=[];
    function App(){const[open,setOpen]=useState(false),[form,setForm]=useState({...EMPTY_MCP_FORM,name:'Sentry',url:'https://mcp.example/mcp',authKind:'header',authChosen:true}),[creds,setCreds]=useState({});
      return <><button onClick={()=>{if(surface==='schedule')openSchedulesWindow();else setOpen(true)}}>Open form</button>
      {surface==='agent'&&<WorkspaceCreateModal open={open} onOpenChange={setOpen}/>}
      {surface==='linked-folder'&&<ReferenceFolderDialog open={open} onOpenChange={setOpen} workspaceId="current" workspaceName="Current agent" device={{id:'device',name:'My computer'}} existing={[]} saving={false} error={null} onSubmit={draft=>window.fixtureCalls.push(draft)}/>}
      {surface==='schedule'&&<TriggersModal/>}
      {(surface==='mcp'||surface==='connector')&&<Dialog open={open} onOpenChange={setOpen}><SettingsPanel title="Plugins" description="Connect the tools your agents use.">
        {surface==='mcp'?<McpServerForm form={form} onChange={patch=>setForm(f=>({...f,...patch}))} detection={{status:'done',url:form.url,detection:{method:'key',status:401,header:'X-API-Key'}}} busy={false} onSubmit={()=>window.fixtureCalls.push(form)} onBack={()=>setOpen(false)}/>:
          <ConnectPanel provider={{id:'sentry',displayName:'Sentry',method:'api_key',configured:true,credentialFields:['organization','project','apiKey']}} connections={[]} creds={creds} busy={false} onCredChange={(key,value)=>setCreds(c=>({...c,[key]:value}))} onConnectDirect={()=>window.fixtureCalls.push(creds)} toolkits={[]} selectedServices={[]} />}
      </SettingsPanel></Dialog>}
      </>;
    }createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TipProvider><App/></TipProvider></QueryClientProvider>);
  `,
    [
      {
        name: 'overlay-home-data',
        setup(build) {
          const modules: Record<string, string> = {
            '@/hooks/use-workspaces': `export const useRunOn=()=>({});export const useWorkspace=()=>({});export const useStackDetection=()=>({data:null});export const useWorkspaces=()=>({data:[{id:'current',name:'Current agent'}]});export const useNewAgentFolder=()=>({data:{path:'/Users/example/agents/new'}});export const useCreateWorkspace=()=>({isPending:false,mutate:(input,options)=>{window.fixtureCalls.push(input);options?.onSuccess?.({id:'created',...input});}});`,
            '@/hooks/use-areas': `export const useAreas=()=>({data:[{id:'work',name:'Work'}]});`,
            '@/hooks/use-client-location': `export const isHostnameClaimed=()=>true;export const useClientLocation=()=>({kind:'host',reason:'localhost',hostname:'localhost'});`,
            '@/components/home/home-context': `export const useOptionalHomeContext=()=>null;export const useHomeDocumentScope=()=>undefined;`,
            '@/contexts/dashboard-context': `export const useOptionalDashboard=()=>null;export const useDashboard=()=>({});`,
            '@/hooks/use-plugin-setup-help': `export const usePluginSetupHelp=()=>({available:true,isPending:false,ask:async()=>null});`,
            '@/hooks/use-triggers': `export const useTriggers=()=>({data:[]});export const useTrigger=()=>({data:null});export const useRuns=()=>({data:[]});export const useRunTrigger=()=>({});export const useDeleteTrigger=()=>({});export const useResetTriggerFailures=()=>({});export const useUpdateTrigger=()=>({isPending:false,error:null,mutate:input=>window.fixtureCalls.push(input)});export const useCreateTrigger=()=>({isPending:false,error:null,mutate:(input,options)=>{window.fixtureCalls.push(input);options?.onSuccess?.({trigger:{id:'created',...input}})}});`,
            '@/hooks/use-user-state': `export const useUserState=()=>({data:{defaultHarness:'codex',defaultModel:'gpt-5.5'}});`,
            '@/hooks/use-harness-models': `export const useHarnessModels=()=>({models:[{id:'gpt-5.5',label:'GPT-5.5'}]});`,
            '@/hooks/use-devices': `export const useLaptopHome=()=>null;`,
            '@/hooks/use-execution': `export const invalidateWorktree=()=>{};export const worktreeFileKey=()=>[];export const useWorktreeScope=()=>null;export const useSessionBaseFile=()=>({});export const useSessionFile=()=>({});export const useSessionTree=()=>({data:[]});export const useSession=()=>({data:{label:'Builder chat'}});`,
            './use-schedule-chat': `export const useScheduleChat=()=>({});export const useAdoptMovedScheduleChat=()=>()=>{};`,
            './schedule-chat-panel': `export const ScheduleChatPanel=()=> <section aria-label="Synthetic builder delivery">Builder chat</section>;`,
            '@/components/workspaces/launcher/launch-controls': `export const ModelControl=()=>null;export const EffortControl=()=>null;`,
            '@/components/runs/run-activity-badge': `export const RunActivityBadge=()=>null;`,
          };
          if (options.builder)
            modules['./schedule-chat-panel'] = `
        import React,{useRef}from'react';
        import{ChatInputEditor}from'@/components/chat/editor/chat-input-editor';
        import{Button}from'@/components/system/button';
        import{Popover,PopoverContent,PopoverTrigger}from'@/components/system/popover';
        import{DropdownMenu,DropdownMenuContent,DropdownMenuTrigger}from'@/components/system/menu';
        import{MenuAction}from'@/components/system/menu-action';
        import{Sheet,SheetContent,SheetTitle,SheetTrigger}from'@/components/system/sheet';
        export function ScheduleChatPanel(){const ref=useRef(null);window.builderDraft=()=>ref.current?.getMarkerOutput().text;
          return <section aria-label="Builder composer" className="flex h-full min-h-0 flex-col gap-3 p-3">
          <Popover><PopoverTrigger asChild><Button>Builder popup</Button></PopoverTrigger><PopoverContent><Button>Popup action</Button></PopoverContent></Popover>
          <DropdownMenu><DropdownMenuTrigger asChild><Button>Builder menu</Button></DropdownMenuTrigger><DropdownMenuContent><MenuAction kind="menu">Menu action</MenuAction></DropdownMenuContent></DropdownMenu>
          <Sheet><SheetTrigger asChild><Button>Builder sheet</Button></SheetTrigger><SheetContent aria-describedby={undefined}><SheetTitle>Builder details</SheetTitle><Button>Sheet action</Button></SheetContent></Sheet>
          <ChatInputEditor ref={ref} ariaLabel="Schedule builder" slashCommands={[{id:'review',name:'review',description:'Review the diff',source:'installed-user',userInvocable:true,available:true,execution:{kind:'provider-slash',provider:'codex',commandText:'/review'}}]} mentionFiles={[{kind:'file',path:'src/index.ts',name:'index.ts'}]} searchMentionEntities={async()=>({tasks:[],notes:[],totals:{tasks:0,notes:0}})}/>
          </section>;
        }
      `;
          if (options.baselinePicker)
            build.onLoad({ filter: /trigger-form\.tsx$/ }, (args) => ({
              loader: 'tsx',
              resolveDir: path.dirname(args.path),
              contents: execFileSync(
                'git',
                ['show', '776ee9d5:src/components/triggers/trigger-form.tsx'],
                { encoding: 'utf8' },
              ),
            }));
          if (options.baselineShell)
            build.onLoad({ filter: /triggers-modal\.tsx$/ }, (args) => ({
              loader: 'tsx',
              resolveDir: path.dirname(args.path),
              contents: execFileSync(
                'git',
                ['show', '4bf74a32:src/components/triggers/triggers-modal.tsx'],
                { encoding: 'utf8' },
              ),
            }));
          for (const name of Object.keys(modules)) {
            build.onResolve(
              {
                filter: new RegExp(
                  '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
                ),
              },
              () => ({ path: name, namespace: 'overlay-data' }),
            );
          }
          build.onLoad({ filter: /.*/, namespace: 'overlay-data' }, (args) => ({
            contents: modules[args.path],
            loader: 'tsx',
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
    { css: true },
  );
}
