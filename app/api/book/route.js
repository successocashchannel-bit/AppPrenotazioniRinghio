
import fs from "fs";
import path from "path";
import {NextResponse} from "next/server";

export async function POST(req){

const body=await req.json();

const file=path.join(process.cwd(),"data","bookings.json");

let data=JSON.parse(fs.readFileSync(file));

data.push(body);

fs.writeFileSync(file,JSON.stringify(data,null,2));

return NextResponse.json({message:"Prenotazione confermata"});

}
