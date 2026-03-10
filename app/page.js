
"use client";
import {useState,useEffect} from "react";

export default function Page(){

const [services,setServices]=useState([]);
const [service,setService]=useState("");
const [date,setDate]=useState("");
const [slots,setSlots]=useState([]);
const [slot,setSlot]=useState("");
const [name,setName]=useState("");
const [phone,setPhone]=useState("");
const [msg,setMsg]=useState("");

useEffect(()=>{
fetch("/api/services").then(r=>r.json()).then(d=>{
setServices(d);
if(d.length>0) setService(d[0].id);
});
},[]);

useEffect(()=>{
if(date){
fetch("/api/slots?date="+date)
.then(r=>r.json())
.then(d=>setSlots(d.slots));
}
},[date]);

async function book(){

const res=await fetch("/api/book",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({service,date,slot,name,phone})
});

const data=await res.json();
setMsg(data.message);

}

return(
<div style={{maxWidth:500}}>

<h1>Ringhio Barbershop</h1>

<select onChange={e=>setService(e.target.value)}>
{services.map(s=>(
<option key={s.id} value={s.id}>{s.name} €{s.price}</option>
))}
</select>

<br/><br/>

<input type="date" onChange={e=>setDate(e.target.value)}/>

<br/><br/>

<select onChange={e=>setSlot(e.target.value)}>
<option>Orario</option>
{slots.map(s=>(
<option key={s}>{s}</option>
))}
</select>

<br/><br/>

<input placeholder="Nome" onChange={e=>setName(e.target.value)}/>

<br/><br/>

<input placeholder="Telefono" onChange={e=>setPhone(e.target.value)}/>

<br/><br/>

<button onClick={book}>Prenota</button>

<p>{msg}</p>

<br/>

<a href="/admin">Dashboard</a>

</div>
)
}
