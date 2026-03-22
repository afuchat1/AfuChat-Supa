import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart,
} from "recharts";

const BRAND = "#00C2CB";
const GOLD = "#D4A853";
const COLORS = [BRAND, GOLD, "#3B82F6", "#EF4444", "#8B5CF6", "#10B981"];

type Stats = {
  totalUsers: number;
  totalPosts: number;
  totalChats: number;
  totalMessages: number;
  premiumUsers: number;
  verifiedUsers: number;
  totalNexa: number;
  totalAcoin: number;
};

type UserRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  xp: number;
  acoin: number;
  current_grade: string;
  country: string | null;
  created_at: string;
};

type PostRow = {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_handle: string;
  is_blocked: boolean;
  view_count: number;
  created_at: string;
};

type SubPlan = {
  id: string;
  name: string;
  description: string;
  acoin_price: number;
  duration_days: number;
  tier: string;
  is_active: boolean;
  grants_verification: boolean;
};

type CurrencySettings = {
  id: string;
  nexa_to_acoin_rate: number;
  conversion_fee_percent: number;
  p2p_fee_percent: number;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter_name?: string;
  reported_name?: string;
};

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon: string; color?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: (color || BRAND) + "15" }}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalPosts: 0, totalChats: 0, totalMessages: 0, premiumUsers: 0, verifiedUsers: 0, totalNexa: 0, totalAcoin: 0 });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [plans, setPlans] = useState<SubPlan[]>([]);
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const [userGrowth, setUserGrowth] = useState<{ date: string; count: number }[]>([]);
  const [gradeDistribution, setGradeDistribution] = useState<{ name: string; value: number }[]>([]);

  const loadStats = useCallback(async () => {
    const [
      { count: totalUsers },
      { count: totalPosts },
      { count: totalChats },
      { count: totalMessages },
      { count: premiumUsers },
      { count: verifiedUsers },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase.from("chats").select("*", { count: "exact", head: true }),
      supabase.from("messages").select("*", { count: "exact", head: true }),
      supabase.from("user_subscriptions").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_verified", true),
    ]);

    const { data: nexaData } = await supabase.from("profiles").select("xp, acoin");
    let totalNexa = 0, totalAcoin = 0;
    for (const p of (nexaData || [])) { totalNexa += p.xp || 0; totalAcoin += p.acoin || 0; }

    setStats({
      totalUsers: totalUsers || 0,
      totalPosts: totalPosts || 0,
      totalChats: totalChats || 0,
      totalMessages: totalMessages || 0,
      premiumUsers: premiumUsers || 0,
      verifiedUsers: verifiedUsers || 0,
      totalNexa,
      totalAcoin,
    });

    const { data: gradeData } = await supabase.from("profiles").select("current_grade");
    if (gradeData) {
      const gMap: Record<string, number> = {};
      for (const g of gradeData) { const gr = g.current_grade || "Unranked"; gMap[gr] = (gMap[gr] || 0) + 1; }
      setGradeDistribution(Object.entries(gMap).map(([name, value]) => ({ name, value })));
    }

    const { data: growthData } = await supabase.from("profiles").select("created_at").order("created_at", { ascending: true });
    if (growthData) {
      const dayMap: Record<string, number> = {};
      for (const p of growthData) {
        const day = new Date(p.created_at).toISOString().split("T")[0];
        dayMap[day] = (dayMap[day] || 0) + 1;
      }
      let cumulative = 0;
      const growth = Object.entries(dayMap).sort().map(([date, count]) => {
        cumulative += count;
        return { date: date.slice(5), count: cumulative };
      });
      setUserGrowth(growth.slice(-30));
    }
  }, []);

  const loadUsers = useCallback(async () => {
    let query = supabase.from("profiles").select("id, handle, display_name, avatar_url, is_verified, xp, acoin, current_grade, country, created_at").order("created_at", { ascending: false }).limit(100);
    if (userSearch) query = query.or(`handle.ilike.%${userSearch}%,display_name.ilike.%${userSearch}%`);
    const { data } = await query;
    if (data) setUsers(data);
  }, [userSearch]);

  const loadPosts = useCallback(async () => {
    let query = supabase.from("posts").select("id, content, author_id, is_blocked, view_count, created_at, profiles!posts_author_id_fkey(display_name, handle)").order("created_at", { ascending: false }).limit(100);
    if (postSearch) query = query.ilike("content", `%${postSearch}%`);
    const { data } = await query;
    if (data) {
      setPosts(data.map((p: any) => ({
        id: p.id,
        content: p.content || "",
        author_id: p.author_id,
        author_name: p.profiles?.display_name || "Unknown",
        author_handle: p.profiles?.handle || "unknown",
        is_blocked: p.is_blocked,
        view_count: p.view_count || 0,
        created_at: p.created_at,
      })));
    }
  }, [postSearch]);

  const loadPlans = useCallback(async () => {
    const { data } = await supabase.from("subscription_plans").select("*").order("acoin_price", { ascending: true });
    if (data) setPlans(data);
  }, []);

  const loadCurrencySettings = useCallback(async () => {
    const { data } = await supabase.from("currency_settings").select("*").limit(1).maybeSingle();
    if (data) setCurrencySettings(data);
  }, []);

  const loadReports = useCallback(async () => {
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50);
    if (data) {
      const userIds = [...new Set(data.flatMap((r: any) => [r.reporter_id, r.reported_id]))];
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
      const nameMap: Record<string, string> = {};
      for (const p of (profiles || [])) nameMap[p.id] = p.display_name;
      setReports(data.map((r: any) => ({ ...r, reporter_name: nameMap[r.reporter_id] || "Unknown", reported_name: nameMap[r.reported_id] || "Unknown" })));
    } else {
      setReports([]);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadUsers();
    loadPosts();
    loadPlans();
    loadCurrencySettings();
    loadReports();
  }, []);

  useEffect(() => { loadUsers(); }, [userSearch]);
  useEffect(() => { loadPosts(); }, [postSearch]);

  async function toggleUserVerification(userId: string, current: boolean) {
    await supabase.from("profiles").update({ is_verified: !current }).eq("id", userId);
    loadUsers();
    loadStats();
  }

  async function togglePostBlock(postId: string, current: boolean) {
    await supabase.from("posts").update({ is_blocked: !current }).eq("id", postId);
    loadPosts();
  }

  async function deletePost(postId: string) {
    await supabase.from("posts").delete().eq("id", postId);
    loadPosts();
    loadStats();
  }

  async function updatePlan(planId: string, field: string, value: any) {
    await supabase.from("subscription_plans").update({ [field]: value }).eq("id", planId);
    loadPlans();
  }

  async function updateCurrency(field: string, value: number) {
    if (!currencySettings) return;
    await supabase.from("currency_settings").update({ [field]: value }).eq("id", currencySettings.id);
    loadCurrencySettings();
  }

  async function adjustUserBalance(userId: string, field: "xp" | "acoin", amount: number) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const newVal = Math.max(0, (field === "xp" ? user.xp : user.acoin) + amount);
    await supabase.from("profiles").update({ [field]: newVal }).eq("id", userId);
    loadUsers();
    loadStats();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ backgroundColor: BRAND }}>
            A
          </div>
          <div>
            <h1 className="font-bold text-lg">AfuChat</h1>
            <p className="text-xs opacity-70">Admin Dashboard</p>
          </div>
        </div>
        <Separator className="bg-sidebar-border" />
        <nav className="flex-1 p-3 space-y-1">
          {[
            { id: "overview", label: "Overview", icon: "📊" },
            { id: "users", label: "Users", icon: "👥" },
            { id: "content", label: "Content", icon: "📝" },
            { id: "subscriptions", label: "Subscriptions", icon: "💎" },
            { id: "currency", label: "Currency", icon: "💰" },
            { id: "moderation", label: "Moderation", icon: "🛡️" },
            { id: "analytics", label: "Analytics", icon: "📈" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 space-y-2">
          <Button
            variant="outline"
            className="w-full text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent"
            onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
          >
            Sign Out
          </Button>
          <div className="text-xs opacity-50 text-center">AfuChat Admin v1.0</div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Dashboard Overview</h2>
                <p className="text-muted-foreground">Platform health at a glance</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Users" value={stats.totalUsers} icon="👥" color={BRAND} />
                <StatCard title="Total Posts" value={stats.totalPosts} icon="📝" color="#3B82F6" />
                <StatCard title="Total Chats" value={stats.totalChats} icon="💬" color="#8B5CF6" />
                <StatCard title="Messages" value={stats.totalMessages} icon="✉️" color="#10B981" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Premium Users" value={stats.premiumUsers} icon="💎" color={GOLD} />
                <StatCard title="Verified Users" value={stats.verifiedUsers} icon="✅" color={GOLD} />
                <StatCard title="Total Nexa" value={stats.totalNexa} icon="🪙" color="#EF4444" />
                <StatCard title="Total ACoin" value={stats.totalAcoin} icon="🔶" color="#F59E0B" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>User Growth</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={userGrowth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="count" stroke={BRAND} fill={BRAND + "30"} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Grade Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={gradeDistribution} cx="50%" cy="50%" outerRadius={90} fill={BRAND} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {gradeDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">User Management</h2>
                  <p className="text-muted-foreground">{users.length} users loaded</p>
                </div>
                <Input
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-64"
                />
              </div>
              <Card>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Handle</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Nexa</TableHead>
                        <TableHead>ACoin</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Verified</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: BRAND }}>
                                {(u.display_name || "?").charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium">{u.display_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">@{u.handle}</TableCell>
                          <TableCell><Badge variant="secondary">{u.current_grade || "N/A"}</Badge></TableCell>
                          <TableCell>{u.xp?.toLocaleString()}</TableCell>
                          <TableCell>{u.acoin?.toLocaleString()}</TableCell>
                          <TableCell>{u.country || "-"}</TableCell>
                          <TableCell>
                            <Switch checked={u.is_verified} onCheckedChange={() => toggleUserVerification(u.id, u.is_verified)} />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm">Balance</Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader><DialogTitle>Adjust Balance: {u.display_name}</DialogTitle></DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">Nexa Balance: {u.xp}</p>
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => adjustUserBalance(u.id, "xp", 100)}>+100</Button>
                                        <Button size="sm" onClick={() => adjustUserBalance(u.id, "xp", 1000)}>+1000</Button>
                                        <Button size="sm" variant="destructive" onClick={() => adjustUserBalance(u.id, "xp", -100)}>-100</Button>
                                      </div>
                                    </div>
                                    <Separator />
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">ACoin Balance: {u.acoin}</p>
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={() => adjustUserBalance(u.id, "acoin", 100)}>+100</Button>
                                        <Button size="sm" onClick={() => adjustUserBalance(u.id, "acoin", 1000)}>+1000</Button>
                                        <Button size="sm" variant="destructive" onClick={() => adjustUserBalance(u.id, "acoin", -100)}>-100</Button>
                                      </div>
                                    </div>
                                  </div>
                                  <DialogFooter><DialogClose asChild><Button variant="outline">Close</Button></DialogClose></DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </div>
          )}

          {activeTab === "content" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Content Moderation</h2>
                  <p className="text-muted-foreground">Manage posts and content</p>
                </div>
                <Input
                  placeholder="Search posts..."
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  className="w-64"
                />
              </div>
              <Card>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Author</TableHead>
                        <TableHead className="w-[40%]">Content</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Posted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posts.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{p.author_name}</span>
                              <br />
                              <span className="text-xs text-muted-foreground">@{p.author_handle}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{p.content}</TableCell>
                          <TableCell>{p.view_count}</TableCell>
                          <TableCell>
                            <Badge variant={p.is_blocked ? "destructive" : "secondary"}>
                              {p.is_blocked ? "Blocked" : "Active"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{timeAgo(p.created_at)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" onClick={() => togglePostBlock(p.id, p.is_blocked)}>
                                {p.is_blocked ? "Unblock" : "Block"}
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => deletePost(p.id)}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </div>
          )}

          {activeTab === "subscriptions" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Subscription Plans</h2>
                <p className="text-muted-foreground">Manage premium subscription tiers</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.map((plan) => (
                  <Card key={plan.id} className={`${!plan.is_active ? "opacity-60" : ""}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        <Badge style={{ backgroundColor: plan.tier === "platinum" ? "#8B5CF6" : plan.tier === "gold" ? GOLD : "#94A3B8", color: "#fff" }}>
                          {plan.tier}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Price</span>
                          <p className="font-bold text-lg">{plan.acoin_price} ACoin</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration</span>
                          <p className="font-bold">{plan.duration_days} days</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Active</span>
                        <Switch checked={plan.is_active} onCheckedChange={() => updatePlan(plan.id, "is_active", !plan.is_active)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Grants Verification</span>
                        <Switch checked={plan.grants_verification} onCheckedChange={() => updatePlan(plan.id, "grants_verification", !plan.grants_verification)} />
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="w-full">Edit Price</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Edit {plan.name}</DialogTitle></DialogHeader>
                          <div className="space-y-4 py-4">
                            <div>
                              <label className="text-sm font-medium">ACoin Price</label>
                              <Input type="number" defaultValue={plan.acoin_price} id={`price-${plan.id}`} />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Duration (days)</label>
                              <Input type="number" defaultValue={plan.duration_days} id={`dur-${plan.id}`} />
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button onClick={() => {
                                const price = parseInt((document.getElementById(`price-${plan.id}`) as HTMLInputElement)?.value);
                                const dur = parseInt((document.getElementById(`dur-${plan.id}`) as HTMLInputElement)?.value);
                                if (!isNaN(price)) updatePlan(plan.id, "acoin_price", price);
                                if (!isNaN(dur)) updatePlan(plan.id, "duration_days", dur);
                              }}>Save Changes</Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {activeTab === "currency" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Currency Settings</h2>
                <p className="text-muted-foreground">Manage Nexa and ACoin economy</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>Economy Overview</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span>Total Nexa in circulation</span>
                      <span className="font-bold text-lg">{stats.totalNexa.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span>Total ACoin in circulation</span>
                      <span className="font-bold text-lg">{stats.totalAcoin.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span>Premium subscribers</span>
                      <span className="font-bold text-lg">{stats.premiumUsers}</span>
                    </div>
                  </CardContent>
                </Card>
                {currencySettings && (
                  <Card>
                    <CardHeader><CardTitle>Conversion Settings</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Nexa to ACoin Rate</label>
                        <p className="text-xs text-muted-foreground mb-1">How many Nexa per 1 ACoin</p>
                        <div className="flex gap-2">
                          <Input type="number" defaultValue={currencySettings.nexa_to_acoin_rate} id="nexa-rate" />
                          <Button onClick={() => {
                            const v = parseFloat((document.getElementById("nexa-rate") as HTMLInputElement)?.value);
                            if (!isNaN(v) && v > 0) updateCurrency("nexa_to_acoin_rate", v);
                          }}>Update</Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Conversion Fee (%)</label>
                        <div className="flex gap-2">
                          <Input type="number" defaultValue={currencySettings.conversion_fee_percent} id="conv-fee" />
                          <Button onClick={() => {
                            const v = parseFloat((document.getElementById("conv-fee") as HTMLInputElement)?.value);
                            if (!isNaN(v) && v >= 0) updateCurrency("conversion_fee_percent", v);
                          }}>Update</Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">P2P Transfer Fee (%)</label>
                        <div className="flex gap-2">
                          <Input type="number" defaultValue={currencySettings.p2p_fee_percent} id="p2p-fee" />
                          <Button onClick={() => {
                            const v = parseFloat((document.getElementById("p2p-fee") as HTMLInputElement)?.value);
                            if (!isNaN(v) && v >= 0) updateCurrency("p2p_fee_percent", v);
                          }}>Update</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === "moderation" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Moderation</h2>
                <p className="text-muted-foreground">Reports and user complaints</p>
              </div>
              {reports.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <span className="text-5xl mb-4">🛡️</span>
                    <p className="text-lg font-medium">No reports</p>
                    <p className="text-sm">All clear! No user reports at this time.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reporter</TableHead>
                          <TableHead>Reported User</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.reporter_name}</TableCell>
                            <TableCell>{r.reported_name}</TableCell>
                            <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                            <TableCell><Badge variant={r.status === "resolved" ? "secondary" : "destructive"}>{r.status}</Badge></TableCell>
                            <TableCell className="text-sm text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <h4 className="font-medium mb-1">Blocked Posts</h4>
                      <p className="text-sm text-muted-foreground">Review and manage blocked content</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTab("content")}>View Content</Button>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <h4 className="font-medium mb-1">Verified Users</h4>
                      <p className="text-sm text-muted-foreground">Manage user verification badges</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setActiveTab("users")}>View Users</Button>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <h4 className="font-medium mb-1">Privacy Controls</h4>
                      <p className="text-sm text-muted-foreground">System-level privacy settings</p>
                      <Badge variant="secondary" className="mt-3">Coming Soon</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Analytics</h2>
                <p className="text-muted-foreground">Platform insights and trends</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>User Growth (Last 30 Days)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={userGrowth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke={BRAND} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Grade Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={gradeDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill={BRAND} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold" style={{ color: BRAND }}>{stats.totalUsers > 0 ? (stats.totalMessages / stats.totalUsers).toFixed(1) : 0}</p>
                    <p className="text-sm text-muted-foreground mt-1">Avg Messages per User</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold" style={{ color: GOLD }}>{stats.totalUsers > 0 ? ((stats.premiumUsers / stats.totalUsers) * 100).toFixed(1) : 0}%</p>
                    <p className="text-sm text-muted-foreground mt-1">Premium Conversion Rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-4xl font-bold" style={{ color: "#8B5CF6" }}>{stats.totalUsers > 0 ? (stats.totalPosts / stats.totalUsers).toFixed(1) : 0}</p>
                    <p className="text-sm text-muted-foreground mt-1">Avg Posts per User</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
