/** Production forms and hosts. Only Home data, mutations and the unrelated builder chat are synthetic. */
import { browserFixture } from './browser-fixture';

export function overlayFormsFixture() {
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
            '@/hooks/use-workspaces': `export const useStackDetection=()=>({data:null});export const useWorkspaces=()=>({data:[{id:'current',name:'Current agent'}]});export const useNewAgentFolder=()=>({data:{path:'/Users/example/agents/new'}});export const useCreateWorkspace=()=>({isPending:false,mutateAsync:async input=>{window.fixtureCalls.push(input);return{id:'created',...input}}});`,
            '@/hooks/use-areas': `export const useAreas=()=>({data:[{id:'work',name:'Work'}]});`,
            '@/hooks/use-client-location': `export const isHostnameClaimed=()=>true;export const useClientLocation=()=>({kind:'host',reason:'localhost',hostname:'localhost'});`,
            '@/components/home/home-context': `export const useOptionalHomeContext=()=>null;export const useHomeDocumentScope=()=>undefined;`,
            '@/contexts/dashboard-context': `export const useOptionalDashboard=()=>null;export const useDashboard=()=>({});`,
            '@/hooks/use-plugin-setup-help': `export const usePluginSetupHelp=()=>({available:true,isPending:false,ask:async()=>null});`,
            '@/hooks/use-triggers': `export const useTriggers=()=>({data:[]});export const useTrigger=()=>({data:null});export const useRuns=()=>({data:[]});export const useRunTrigger=()=>({});export const useDeleteTrigger=()=>({});export const useResetTriggerFailures=()=>({});export const useUpdateTrigger=()=>({isPending:false,error:null,mutate:input=>window.fixtureCalls.push(input)});export const useCreateTrigger=()=>({isPending:false,error:null,mutate:(input,options)=>{window.fixtureCalls.push(input);options?.onSuccess?.({trigger:{id:'created',...input}})}});`,
            '@/hooks/use-user-state': `export const useUserState=()=>({data:{defaultHarness:'codex',defaultModel:'gpt-5.5'}});`,
            '@/hooks/use-harness-models': `export const useHarnessModels=()=>({models:[{id:'gpt-5.5',label:'GPT-5.5'}]});`,
            '@/hooks/use-devices': `export const useLaptopHome=()=>null;`,
            '@/hooks/use-execution': `export const useSession=()=>({data:{label:'Builder chat'}});`,
            './use-schedule-chat': `export const useScheduleChat=()=>({});export const useAdoptMovedScheduleChat=()=>()=>{};`,
            './schedule-chat-panel': `export const ScheduleChatPanel=()=> <section aria-label="Synthetic builder delivery">Builder chat</section>;`,
            '@/components/workspaces/launcher/launch-controls': `export const ModelControl=()=>null;export const EffortControl=()=>null;`,
            '@/components/runs/run-activity-badge': `export const RunActivityBadge=()=>null;`,
          };
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
