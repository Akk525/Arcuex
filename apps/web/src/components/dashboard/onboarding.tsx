'use client';

import Link from 'next/link';
import { Check, Code, Robot, ShieldCheck } from '@phosphor-icons/react';
import { useWalletStatus } from '@/hooks/use-wallet-status';
import { useWalletSignIn } from '@/hooks/use-wallet-sign-in';
import { Button, ButtonLink } from '@/components/ui/button';
import { Panel } from '@/components/panel';
import { WorkList, WorkRow } from '@/components/ui/work-row';

type StepState = 'done' | 'current' | 'upcoming';

/**
 * First-run setup driven by live wallet + session state. Nothing here is
 * sample data: each step reflects what this browser has actually done.
 */
export function Onboarding() {
  const wallet = useWalletStatus();
  const auth = useWalletSignIn();
  const connected = Boolean(wallet.address);
  const onArc = wallet.uiStatus === 'ready';

  const connectState: StepState = onArc ? 'done' : 'current';
  const signInState: StepState = onArc ? 'current' : 'upcoming';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
      <Panel title="Set up your workspace" description="Two steps unlock your policies, agents and claims.">
        <ol className="grid gap-0">
          <Step
            n={1}
            state={connectState}
            title="Connect a wallet on Arc Testnet"
            body="Arcuex works with injected browser wallets. It never asks for a private key or seed phrase."
          >
            {wallet.uiStatus === 'disconnected' ? (
              <Button size="sm" onClick={() => void wallet.connectInjected()}>
                Connect wallet
              </Button>
            ) : wallet.uiStatus === 'wrong_network' ? (
              <Button size="sm" variant="secondary" onClick={() => void wallet.switchToArc()}>
                Switch to Arc Testnet
              </Button>
            ) : wallet.uiStatus === 'connecting' || wallet.uiStatus === 'switching' ? (
              <span role="status" className="text-[0.8125rem] text-[var(--ink-muted)]">
                Waiting for your wallet…
              </span>
            ) : null}
            {!wallet.hasInjectedConnector && !connected ? (
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                No browser wallet detected. Install MetaMask or Rabby, then reload.
              </p>
            ) : null}
          </Step>
          <Step
            n={2}
            state={signInState}
            title="Sign in with your wallet"
            body="Sign a one-time message to open a claims session. Signing costs nothing and moves no funds."
          >
            {onArc ? (
              <Button size="sm" onClick={() => void auth.signIn()} disabled={auth.busy}>
                {auth.busy ? 'Check your wallet…' : 'Sign in'}
              </Button>
            ) : null}
            {auth.error ? (
              <p role="alert" className="mt-2 text-xs text-[var(--danger)]">
                {auth.error}
              </p>
            ) : null}
          </Step>
          <Step
            n={3}
            state="upcoming"
            title="Buy coverage or register an agent"
            body="Quote and bind a policy yourself, or let a registered agent procure within a delegation you grant."
            last
          >
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/coverage" size="sm" variant="secondary">
                Buy coverage
              </ButtonLink>
              <ButtonLink href="/agent" size="sm" variant="ghost">
                Register an agent
              </ButtonLink>
            </div>
          </Step>
        </ol>
      </Panel>

      <Panel title="Explore without signing in" flush>
        <WorkList label="Explore">
          <WorkRow
            href="/coverage"
            icon={<ShieldCheck size={18} weight="duotone" />}
            iconTone="accent"
            title="Coverage products"
            meta="Published terms, limits and deductibles"
          />
          <WorkRow
            href="/agent"
            icon={<Robot size={18} weight="duotone" />}
            iconTone="accent"
            title="Agents and delegation"
            meta="How scoped authority to bind works"
          />
          <WorkRow
            href="/integrations"
            icon={<Code size={18} weight="duotone" />}
            iconTone="accent"
            title="SDK and integrations"
            meta="Connect an agent with @arcuex/agent-sdk"
          />
        </WorkList>
        <p className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-muted)] sm:px-5">
          Underwriting is synthetic on this testnet build. <Link href="/" className="underline underline-offset-2 hover:text-[var(--ink)]">About Arcuex</Link>
        </p>
      </Panel>
    </div>
  );
}

function Step({
  n,
  state,
  title,
  body,
  children,
  last = false,
}: {
  n: number;
  state: StepState;
  title: string;
  body: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3.5 pb-5 last:pb-0">
      {!last ? (
        <span
          aria-hidden="true"
          className={`absolute top-8 bottom-1 left-[0.8125rem] w-px ${state === 'done' ? 'bg-[var(--accent-signal)]' : 'bg-[var(--line-strong)]'}`}
        />
      ) : null}
      <span
        className={`relative grid h-7 w-7 place-items-center rounded-full text-xs font-semibold tabular-nums ${
          state === 'done'
            ? 'bg-[var(--accent-signal)] text-white'
            : state === 'current'
              ? 'bg-[var(--accent)] text-white ring-4 ring-[var(--accent-soft)]'
              : 'bg-[var(--surface)] text-[var(--ink-muted)] ring-1 ring-[var(--line-strong)]'
        }`}
      >
        {state === 'done' ? <Check size={14} weight="bold" aria-label="Done" /> : n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={`text-sm font-semibold ${state === 'upcoming' ? 'text-[var(--ink-secondary)]' : 'text-[var(--ink)]'}`}>
          {title}
        </p>
        <p className="mt-0.5 max-w-[56ch] text-[0.8125rem] leading-relaxed text-[var(--ink-muted)]">{body}</p>
        {children && state !== 'done' ? <div className="mt-3">{children}</div> : null}
      </div>
    </li>
  );
}
