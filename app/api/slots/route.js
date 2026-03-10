
import fs from "fs";
import path from "path";
import {NextResponse} from "next/server";

function slots(){

let s=[];

for(let h=9;h<19;h++){

s.push(h+":00");
s.push(h+":30");

}

return s;

}

export async function GET(req){

const {searchParams}=new URL(req.url);
const date=searchParams.get("date");

const file=path.join(process.cwd(),"data","bookings.json");
const bookings=JSON.parse(fs.readFileSync(file));

let available=slots();

const booked=bookings.filter(b=>b.date===date).map(b=>b.slot);

available=available.filter(a=>!booked.includes(a));

return NextResponse.json({slots:available});

}
