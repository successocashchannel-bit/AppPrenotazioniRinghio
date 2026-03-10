
import fs from "fs";
import path from "path";

export default function Admin(){

const file=path.join(process.cwd(),"data","bookings.json");
const data=JSON.parse(fs.readFileSync(file));

return(
<div>

<h1>Prenotazioni</h1>

<table border="1" cellPadding="10">

<thead>
<tr>
<th>Data</th>
<th>Ora</th>
<th>Nome</th>
<th>Telefono</th>
<th>WhatsApp</th>
</tr>
</thead>

<tbody>

{data.map((b,i)=>(

<tr key={i}>
<td>{b.date}</td>
<td>{b.slot}</td>
<td>{b.name}</td>
<td>{b.phone}</td>
<td><a href={"https://wa.me/"+b.phone}>Apri</a></td>
</tr>

))}

</tbody>

</table>

</div>
)
}
