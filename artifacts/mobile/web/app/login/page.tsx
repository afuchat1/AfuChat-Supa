"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [submitted, setSubmitted] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className="screen">
      <div className="orb one" /><div className="orb two" /><div className="orb three" />
      <div className="auth-shell">
        <section className="auth-card">
          <div className="brand auth-brand"><img src="/images/white-logo-bold.png" alt="" /><span>AfuChat</span></div>
          <h1>Welcome back</h1>
          <p>Sign in to continue to your AfuChat home.</p>
          <form className="auth-form" onSubmit={submit}>
            <input className="auth-input" type="email" required placeholder="Email address" aria-label="Email address" />
            <input className="auth-input" type="password" required autoComplete="current-password" placeholder="Password" aria-label="Password" />
            <button className="auth-submit" type="submit">{submitted ? "Ready to sign in" : "Sign in"}</button>
          </form>
          <div className="auth-links"><span>New to AfuChat?</span><a href="#create-account">Create an account</a></div>
          <Link className="back-link" href="/">← Back to welcome</Link>
        </section>
      </div>
    </main>
  );
}