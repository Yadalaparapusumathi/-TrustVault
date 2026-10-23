#!/usr/bin/env python3
"""
Authorisation mutation check: removes one security check at a time, runs the backend test suite, and reports whether
the suite noticed. Every line should say KILLED. Run from the repository root (needs Docker for Testcontainers):

    python3 scripts/authz-mutation-check.py          # all mutations
    python3 scripts/authz-mutation-check.py 0 3      # selected ones

Each file is restored after its run, even on failure.
"""
import subprocess, sys, shutil, re
B='backend/src/main/java/com/trustvault/'
M=[
 ("no-grant => allow READ", B+'document/DocumentAccessService.java',
  '''        if (access.isEmpty()) {
            deny(documentId, user, required, attemptedAction, "no_grant");
            throw notFound();
        }''', '''        if (access.isEmpty()) {
            access = Optional.of(Access.READ);
        }'''),
 ("skip permission level check", B+'document/DocumentAccessService.java',
  'if (!access.get().covers(required)) {', 'if (false) {'),
 ("grants ignore expiry/revocation", B+'document/DocumentAccessService.java',
  '''        if (document.isDeleted()) {
            return Optional.empty();
        }''', ''),
 ("search drops access predicate", B+'document/DocumentSearchService.java',
  'where.add(cb.or(isOwner, hasGrant));', ''),
 ("revoke ignores document scoping", B+'document/GrantService.java',
  '.filter(g -> g.getDocument().getId().equals(documentId) && g.getRevokedAt() == null)', '.filter(g -> g.getRevokedAt() == null)'),
 ("upload role check removed", B+'document/DocumentService.java',
  'if (!caller.hasRole(Role.OWNER)) {', 'if (false) {'),
 ("admin method-level role check removed", B+'admin/AdminController.java',
  "    public List<String> actions() {\n        CurrentUser.requireRole(Role.ADMIN);", "    public List<String> actions() {"),
 ("deactivated users keep sessions", B+'auth/SessionService.java',
  "if (expired || !user.isActive()) {", "if (expired) {"),
 ("directory role rule removed", B+'config/SecurityConfig.java',
  '.requestMatchers("/api/users/directory").hasAnyRole("OWNER", "ADMIN")', '.requestMatchers("/api/users/directory").authenticated()'),
 ("delete user method-level role check removed", B+'admin/AdminController.java',
  'userService.delete(CurrentUser.requireRole(Role.ADMIN), id);', 'userService.delete(CurrentUser.require(), id);'),
]
only = sys.argv[1:] 
for i,(name,f,old,new) in enumerate(M):
    if only and str(i) not in only: continue
    src=open(f).read()
    assert old in src, name
    shutil.copy(f,'/tmp/mut.bak')
    open(f,'w').write(src.replace(old,new,1))
    try:
        r=subprocess.run(['mvn','-B','-f','backend/pom.xml','test'],capture_output=True,text=True)
        m=re.findall(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+)',r.stdout)
        last=m[-1] if m else ('?','?','?')
        killed = r.returncode!=0
        print(f"[{'KILLED' if killed else 'SURVIVED'}] {name}: run={last[0]} fail={last[1]} err={last[2]}", flush=True)
    finally:
        shutil.copy('/tmp/mut.bak',f)
