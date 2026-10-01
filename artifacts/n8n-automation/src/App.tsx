import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useParams, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Workflows from "@/pages/workflows";
import WorkflowEditor from "@/pages/workflow-editor";
import Executions from "@/pages/executions";
import ExecutionDetail from "@/pages/execution-detail";
import Billing from "@/pages/billing";
import Credentials from "@/pages/credentials";
import Pricing from "@/pages/pricing";
import Approvals from "@/pages/approvals";
import SettingsSso from "@/pages/settings-sso";
import SettingsSelfHost from "@/pages/settings-self-host";
import SettingsMcp from "@/pages/settings-mcp";
import Templates from "@/pages/templates";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const clerkPubKey = import.meta.env.VITE_LOCAL_MODE === "true" ? "local" : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function WorkflowEditorWrapper() {
  const params = useParams<{ id: string }>();
  return <WorkflowEditor id={params.id} />;
}

function ExecutionDetailWrapper() {
  const params = useParams<{ id: string }>();
  return <ExecutionDetail id={params.id} />;
}

function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRoute() {
  if (import.meta.env.VITE_LOCAL_MODE === "true") {
    return <Landing />;
  }
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Show when="signed-in">
      <Layout>{children}</Layout>
    </Show>
  );
}

function DashboardRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><Dashboard /></AppLayout>
    </>
  );
}

function WorkflowsRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><Workflows /></AppLayout>
    </>
  );
}

function WorkflowEditorRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><WorkflowEditor /></AppLayout>
    </>
  );
}

function WorkflowEditorParamRoute() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><WorkflowEditor id={params.id} /></AppLayout>
    </>
  );
}

function ExecutionsRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><Executions /></AppLayout>
    </>
  );
}

function ExecutionDetailRoute() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><ExecutionDetail id={params.id} /></AppLayout>
    </>
  );
}

function BillingRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><Billing /></AppLayout>
    </>
  );
}

function CredentialsRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><Credentials /></AppLayout>
    </>
  );
}

function PricingRoute() {
  return <Pricing />;
}

function ApprovalsRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><Approvals /></AppLayout>
    </>
  );
}

function SettingsSsoRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><SettingsSso /></AppLayout>
    </>
  );
}

function SettingsSelfHostRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><SettingsSelfHost /></AppLayout>
    </>
  );
}

function TemplatesRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><Templates /></AppLayout>
    </>
  );
}

function SettingsMcpRoute() {
  return (
    <>
      <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      <AppLayout><SettingsMcp /></AppLayout>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AppRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{
        signIn: { start: { title: "Sign in to Automation Studio", subtitle: "Welcome back! Please sign in to continue." } },
        signUp: { start: { title: "Create your Automation Studio account", subtitle: "Get started — free forever on the Hobby plan." } },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRoute} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/dashboard" component={DashboardRoute} />
            <Route path="/workflows" component={WorkflowsRoute} />
            <Route path="/workflows/new" component={WorkflowEditorRoute} />
            <Route path="/workflows/:id" component={WorkflowEditorParamRoute} />
            <Route path="/executions" component={ExecutionsRoute} />
            <Route path="/executions/:id" component={ExecutionDetailRoute} />
            <Route path="/billing" component={BillingRoute} />
            <Route path="/credentials" component={CredentialsRoute} />
            <Route path="/approvals" component={ApprovalsRoute} />
            <Route path="/settings/sso" component={SettingsSsoRoute} />
            <Route path="/settings/self-host" component={SettingsSelfHostRoute} />
            <Route path="/settings/mcp" component={SettingsMcpRoute} />
            <Route path="/templates" component={TemplatesRoute} />
            <Route path="/pricing" component={PricingRoute} />
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Auth not configured — VITE_CLERK_PUBLISHABLE_KEY missing</p>
      </div>
    );
  }

  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;
