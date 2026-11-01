(function(){
const K='gv_db',now=()=>new Date().toISOString();
function seed(){
 const P={MTN:[['500MB 30 days',140],['1GB 30 days',280],['2GB 30 days',560],['5GB 30 days',1400]],AIRTEL:[['1GB 30 days',270],['2GB 30 days',540],['5GB 30 days',1350]],GLO:[['1GB 30 days',250],['3GB 30 days',720],['5GB 30 days',1200]],'9MOBILE':[['1GB 30 days',260],['2GB 30 days',520]]};
 const d={users:[{id:'u0',name:'Admin',email:'admin@gvdata.demo',phone:'08000000000',password:'admin123',wallet:50000,is_admin:true}],plans:[],tx:[],n:1,p:1};
 for(const n in P)for(const [name,price] of P[n])d.plans.push({id:d.p++,network:n,name,price,code:'DEMO',active:true});
 return d}
const load=()=>JSON.parse(localStorage.getItem(K)||'null')||seed(),save=d=>localStorage.setItem(K,JSON.stringify(d));
window.demoApi=async(r,b={})=>{
 const d=load(),u=d.users.find(x=>x.id===localStorage.getItem('gv_t')),E=m=>{throw new Error(m)},pub=x=>({...x,password:undefined});
 if(r==='register'){const em=(b.email||'').toLowerCase();if(d.users.find(x=>x.email===em))E('Email already registered');const n={id:'u'+d.n++,name:b.name,email:em,phone:b.phone,password:b.password,wallet:0,is_admin:false};d.users.push(n);save(d);return{token:n.id,user:pub(n)}}
 if(r==='login'){const x=d.users.find(x=>x.email===(b.email||'').toLowerCase()&&x.password===b.password);if(!x)E('Wrong email or password');return{token:x.id,user:pub(x)}}
 if(r==='plans')return d.plans.filter(p=>p.active);
 if(!u)E('Please log in');
 const tx=(user,type,amount,status,detail)=>{d.tx.unshift({id:'t'+Date.now()+Math.random(),user_id:user,type,amount,status,detail,created_at:now()})};
 if(r==='me')return pub(u);
 if(r==='history')return d.tx.filter(x=>x.user_id===u.id).slice(0,50);
 if(r==='fund'){const a=Number(b.amount);if(!(a>=100))E('Minimum funding is 100');if(!confirm('DEMO payment: pay ₦'+a+' with test card?'))E('Payment cancelled');u.wallet+=a;tx(u.id,'fund',a,'success',{demo:1});save(d);return{url:location.pathname}}
 if(r==='verify')return{credited:false};
 if(r==='buy'){let a;if(b.service==='data'){const p=d.plans.find(x=>x.id==b.plan_id);if(!p)E('Plan not found');a=Number(p.price)}else{a=Number(b.amount);if(!(a>=50))E('Minimum amount is 50')}
  if(u.wallet<a)E('Insufficient wallet balance. Fund your wallet first.');u.wallet-=a;tx(u.id,b.service,a,'success',b);save(d);return{ok:1,message:'Delivered successfully (demo)'}}
 if(!u.is_admin)E('Admin only');
 if(r==='a_stats')return{users:d.users.map(pub),transactions:d.tx.slice(0,200),sales:d.tx.filter(x=>x.status==='success'&&x.type!=='fund').reduce((s,x)=>s+x.amount,0)};
 if(r==='a_plan'){const row={network:b.network,name:b.name,price:Number(b.price),code:b.code,active:true};const p=b.id&&d.plans.find(x=>x.id==b.id);if(p)Object.assign(p,row);else d.plans.push({id:d.p++,...row});save(d);return{ok:1}}
 if(r==='a_credit'){const t=d.users.find(x=>x.id===b.user_id),a=Number(b.amount);if(!t||!a||t.wallet+a<0)E('Could not adjust wallet');t.wallet+=a;tx(t.id,'fund',Math.abs(a),'success',{by:'admin'});save(d);return{ok:1}}
 E('Unknown route')};
})();
