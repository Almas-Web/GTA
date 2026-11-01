const {createClient}=require('@supabase/supabase-js'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),crypto=require('crypto');
const E=process.env,db=E.SUPABASE_URL?createClient(E.SUPABASE_URL,E.SUPABASE_SERVICE_KEY):null;
const sign=u=>jwt.sign({id:u.id,admin:u.is_admin},E.JWT_SECRET,{expiresIn:'7d'});
const me=req=>{try{return jwt.verify((req.headers.authorization||'').slice(7),E.JWT_SECRET)}catch{return null}};
const pub=u=>({id:u.id,name:u.name,email:u.email,phone:u.phone,wallet:u.wallet,is_admin:u.is_admin});
// EDIT THIS to match your DataPlug / EasyAccess API docs (endpoint, auth header, body fields, success check)
async function provider(type,p){
  const r=await fetch(E.PROVIDER_URL+'/'+type,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+E.PROVIDER_KEY},body:JSON.stringify(p)});
  const j=await r.json().catch(()=>({}));
  return {ok:r.ok&&j.success!==false&&j.status!=='failed',raw:j};
}
async function paystack(path,body){
  const r=await fetch('https://api.paystack.co'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+E.PAYSTACK_SECRET,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  return r.json();
}
async function creditIfPaid(ref){
  const v=await paystack('/transaction/verify/'+encodeURIComponent(ref));
  if(!v.status||v.data.status!=='success')return false;
  const {data:t}=await db.from('transactions').update({status:'success'}).eq('reference',ref).eq('status','pending').eq('type','fund').select().maybeSingle();
  if(!t)return false; // already credited or unknown
  if(Math.round(t.amount*100)!==v.data.amount){await db.from('transactions').update({status:'mismatch'}).eq('id',t.id);return false}
  await db.rpc('adjust_wallet',{uid:t.user_id,amt:t.amount});return true;
}
module.exports=async(req,res)=>{
  const r=req.query.r,b=req.body||{},send=(d,c=200)=>res.status(c).json(d),bad=(m,c=400)=>send({error:m},c);
  try{
    if(r==='config')return send({demo:!db});
    if(!db)return bad('Demo mode',503);
    if(r==='register'){
      if(!b.email||!b.password||b.password.length<6)return bad('Enter email and a password of 6+ characters');
      const {data,error}=await db.from('users').insert({name:b.name,email:b.email.toLowerCase(),phone:b.phone,password_hash:await bcrypt.hash(b.password,10),is_admin:b.email.toLowerCase()===(E.ADMIN_EMAIL||'').toLowerCase()}).select().single();
      if(error)return bad('Email already registered');
      return send({token:sign(data),user:pub(data)});
    }
    if(r==='login'){
      const {data}=await db.from('users').select().eq('email',(b.email||'').toLowerCase()).maybeSingle();
      if(!data||!await bcrypt.compare(b.password||'',data.password_hash))return bad('Wrong email or password',401);
      return send({token:sign(data),user:pub(data)});
    }
    if(r==='webhook'){ // Paystack webhook: we never trust the body, we re-verify with Paystack
      if(b.event==='charge.success'&&b.data&&b.data.reference)await creditIfPaid(b.data.reference);
      return send({ok:1});
    }
    if(r==='plans'){const {data}=await db.from('plans').select('id,network,name,price').eq('active',true).order('network').order('price');return send(data)}
    const u=me(req);if(!u)return bad('Please log in',401);
    if(r==='me'){const {data}=await db.from('users').select().eq('id',u.id).single();return send(pub(data))}
    if(r==='history'){const {data}=await db.from('transactions').select().eq('user_id',u.id).order('created_at',{ascending:false}).limit(50);return send(data)}
    if(r==='fund'){
      const amt=Number(b.amount);if(!(amt>=100))return bad('Minimum funding is 100');
      const {data:usr}=await db.from('users').select('email').eq('id',u.id).single();
      const ref='GV'+Date.now()+crypto.randomBytes(3).toString('hex');
      await db.from('transactions').insert({user_id:u.id,type:'fund',amount:amt,reference:ref,detail:{}});
      const p=await paystack('/transaction/initialize',{email:usr.email,amount:Math.round(amt*100),reference:ref,callback_url:E.SITE_URL+'/?ref='+ref});
      return p.status?send({url:p.data.authorization_url}):bad('Payment could not start');
    }
    if(r==='verify'){const ok=await creditIfPaid(b.reference);return send({credited:ok})}
    if(r==='buy'){ // service: data | airtime | cable | electricity
      let amt,detail={service:b.service,phone:b.phone};
      if(b.service==='data'){
        const {data:p}=await db.from('plans').select().eq('id',b.plan_id).eq('active',true).maybeSingle();
        if(!p)return bad('Plan not found');amt=Number(p.price);detail={...detail,network:p.network,plan:p.name,code:p.code};
      }else{
        amt=Number(b.amount);if(!(amt>=50))return bad('Minimum amount is 50');
        detail={...detail,network:b.network,provider:b.provider,number:b.number,meter_type:b.meter_type};
      }
      const {error}=await db.rpc('adjust_wallet',{uid:u.id,amt:-amt});
      if(error)return bad('Insufficient wallet balance. Fund your wallet first.');
      const {data:t}=await db.from('transactions').insert({user_id:u.id,type:b.service,amount:amt,detail}).select().single();
      let out;try{out=await provider(b.service,detail)}catch(e){out={ok:false,raw:{error:String(e)}}}
      if(out.ok){await db.from('transactions').update({status:'success',detail:{...detail,api:out.raw}}).eq('id',t.id);return send({ok:1,message:'Delivered successfully'})}
      await db.rpc('adjust_wallet',{uid:u.id,amt}); // auto refund
      await db.from('transactions').update({status:'failed',detail:{...detail,api:out.raw}}).eq('id',t.id);
      return bad('Transaction failed. Your wallet was refunded.');
    }
    if(!u.admin)return bad('Admin only',403);
    if(r==='a_stats'){
      const [us,tx]=await Promise.all([db.from('users').select('id,name,email,phone,wallet,created_at').order('created_at',{ascending:false}).limit(200),db.from('transactions').select('*').order('created_at',{ascending:false}).limit(200)]);
      const sales=tx.data.filter(x=>x.status==='success'&&x.type!=='fund').reduce((s,x)=>s+Number(x.amount),0);
      return send({users:us.data,transactions:tx.data,sales});
    }
    if(r==='a_plan'){
      const row={network:b.network,name:b.name,price:b.price,code:b.code,active:b.active!==false};
      const q=b.id?db.from('plans').update(row).eq('id',b.id):db.from('plans').insert(row);
      const {error}=await q;return error?bad(error.message):send({ok:1});
    }
    if(r==='a_credit'){
      const amt=Number(b.amount);if(!amt)return bad('Enter amount');
      const {error}=await db.rpc('adjust_wallet',{uid:b.user_id,amt});
      if(error)return bad('Could not adjust wallet');
      await db.from('transactions').insert({user_id:b.user_id,type:'fund',amount:Math.abs(amt),status:'success',detail:{by:'admin',amount:amt}});
      return send({ok:1});
    }
    return bad('Unknown route',404);
  }catch(e){console.error(e);return bad('Server error',500)}
};
