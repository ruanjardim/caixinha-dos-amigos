import { Document, Page, StyleSheet, Text, View, Svg, Rect, Circle, Path } from "@react-pdf/renderer";

/** Dados já formatados para o PDF (o componente não faz cálculos). */
export type ReceiptView = {
  number: string;
  code: string;
  participantName: string;
  cycleName: string;
  amount: string;
  amountInWords: string;
  receivedAt: string;
  method: string;
  transactionRef: string | null;
  confirmedBy: string;
  confirmedAt: string;
  issuedAt: string;
};

const GREEN = "#60702f";
const INK = "#0f1a16";
const MUTED = "#66746e";
const LINE = "#e3e9e6";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10.5, color: INK, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 8, color: GREEN, letterSpacing: 2 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  number: { color: MUTED, fontSize: 9 },
  amountBox: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    padding: 16,
    marginVertical: 18,
    backgroundColor: "#ecfdf3",
  },
  amount: { fontSize: 24, fontFamily: "Helvetica-Bold", color: GREEN },
  words: { marginTop: 4, color: INK },
  body: { lineHeight: 1.45, marginBottom: 18 },
  table: { borderTopWidth: 1, borderColor: LINE },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: LINE, paddingVertical: 7 },
  label: { width: 160, color: MUTED },
  value: { flex: 1 },
  note: { marginTop: 22, fontSize: 8.5, color: MUTED, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 36, left: 48, right: 48, fontSize: 8, color: MUTED, textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },
});

function Logo() {
  return (
    <Svg width={36} height={36} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={12} fill={GREEN} />
      <Circle cx={19.5} cy={12} r={5} fill="#d3d9a8" />
      <Circle cx={28.5} cy={12} r={5} fill="#ffffff" stroke={GREEN} strokeWidth={1.5} />
      <Rect x={8.5} y={19} width={31} height={6} rx={2.5} fill="#ffffff" />
      <Rect x={18} y={21} width={12} height={2} rx={1} fill="#4d5a27" />
      <Path d="M11 26h26v9.5a3.5 3.5 0 0 1-3.5 3.5h-19A3.5 3.5 0 0 1 11 35.5z" fill="#ffffff" />
      <Path d="M19 30.5q5 4 10 0" stroke={GREEN} strokeWidth={2.2} fill="none" />
    </Svg>
  );
}

export function ReceiptDocument({ r }: { r: ReceiptView }) {
  const rows: [string, string][] = [
    ["Participante", r.participantName],
    ["Ciclo", r.cycleName],
    ["Data do crédito", r.receivedAt],
    ["Forma de pagamento", r.method],
    ...(r.transactionRef ? ([["Referência da transação", r.transactionRef]] as [string, string][]) : []),
    ["Conferido e confirmado por", `${r.confirmedBy} em ${r.confirmedAt}`],
  ];
  return (
    <Document title={`Recibo ${r.number} — Caixinha dos Amigos`} author="Caixinha dos Amigos" language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.brand}>
            <Logo />
            <View>
              <Text style={s.brandName}>CAIXINHA</Text>
              <Text style={s.brandSub}>DOS AMIGOS</Text>
            </View>
          </View>
          <Text style={s.number}>Emitido em {r.issuedAt}</Text>
        </View>

        <Text style={s.title}>Recibo de contribuição</Text>
        <Text style={s.number}>Nº {r.number}</Text>

        <View style={s.amountBox}>
          <Text style={s.amount}>{r.amount}</Text>
          <Text style={s.words}>({r.amountInWords})</Text>
        </View>

        <Text style={s.body}>
          Recebemos de <Text style={s.bold}>{r.participantName}</Text> a importância acima, referente à contribuição
          para a caixinha coletiva do grupo no {r.cycleName}, conferida no extrato da conta da caixinha.
        </Text>

        <View style={s.table}>
          {rows.map(([label, value]) => (
            <View style={s.row} key={label}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.value}>{value}</Text>
            </View>
          ))}
          <View style={s.row}>
            <Text style={s.label}>Código de verificação</Text>
            <Text style={[s.value, s.bold]}>{r.code}</Text>
          </View>
        </View>

        <Text style={s.note}>
          Este recibo comprova somente o recebimento da contribuição (principal). Ele não representa investimento,
          rendimento ou promessa de resultado. Eventuais resultados dependem de apuração ao final do ciclo, conforme as
          regras aprovadas pelo grupo. O código de verificação pode ser conferido com a administração.
        </Text>

        <Text style={s.footer} fixed>
          Caixinha dos Amigos · grupo privado · documento gerado eletronicamente
        </Text>
      </Page>
    </Document>
  );
}
