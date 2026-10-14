import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCell, pdfText } from "./format";
import type { ReportDoc, ReportSection } from "./types";

const GREEN = "#039855";
const INK = "#0f1a16";
const MUTED = "#66746e";
const LINE = "#e3e9e6";

const s = StyleSheet.create({
  page: {
    paddingTop: 70,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 8.5,
    color: INK,
    fontFamily: "Helvetica",
  },
  header: {
    position: "absolute",
    top: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderColor: GREEN,
    paddingBottom: 6,
  },
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", color: GREEN, letterSpacing: 1 },
  headerRight: { fontSize: 7.5, color: MUTED, textAlign: "right" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9.5, color: MUTED, marginTop: 2, marginBottom: 8 },
  stamp: {
    alignSelf: "flex-start",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#b54708",
    borderWidth: 1,
    borderColor: "#fedf89",
    backgroundColor: "#fffaeb",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginBottom: 8,
  },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  summaryItem: { width: "24%", borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 6 },
  summaryLabel: { fontSize: 7, color: MUTED, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: LINE, paddingVertical: 3.5 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK, paddingVertical: 3.5 },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: INK,
    paddingVertical: 3.5,
    fontFamily: "Helvetica-Bold",
  },
  headCell: { fontFamily: "Helvetica-Bold", color: MUTED, paddingHorizontal: 3 },
  cell: { paddingHorizontal: 3 },
  empty: { color: MUTED, paddingVertical: 6 },
  notes: { marginTop: 14, borderTopWidth: 0.5, borderColor: LINE, paddingTop: 6 },
  note: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
  },
});

const numeric = new Set(["money", "int", "percent"]);

function Table({ section }: { section: ReportSection }) {
  const widths = section.columns.map((c) => c.width ?? 1.4);
  const total = widths.reduce((a, b) => a + b, 0);
  const col = (i: number) => ({
    width: `${(widths[i] / total) * 100}%`,
    textAlign: numeric.has(section.columns[i].kind) ? ("right" as const) : ("left" as const),
  });
  return (
    <View>
      <Text style={s.sectionTitle}>{pdfText(section.title)}</Text>
      <View style={s.headRow} fixed>
        {section.columns.map((c, i) => (
          <Text key={c.key} style={[s.headCell, col(i)]}>
            {pdfText(c.label)}
          </Text>
        ))}
      </View>
      {section.rows.length === 0 ? (
        <Text style={s.empty}>{pdfText(section.emptyMessage ?? "Sem registros.")}</Text>
      ) : (
        section.rows.map((row, r) => (
          <View key={r} style={s.row} wrap={false}>
            {section.columns.map((c, i) => (
              <Text key={c.key} style={[s.cell, col(i)]}>
                {pdfText(formatCell(row[c.key] ?? null, c.kind))}
              </Text>
            ))}
          </View>
        ))
      )}
      {section.totals && section.rows.length > 0 && (
        <View style={s.totalRow} wrap={false}>
          {section.columns.map((c, i) => {
            const v = section.totals![c.key];
            return (
              <Text key={c.key} style={[s.cell, col(i)]}>
                {v === undefined ? "" : pdfText(typeof v === "string" ? v : formatCell(v, c.kind))}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function ReportPdf({ doc }: { doc: ReportDoc }) {
  return (
    <Document title={`${doc.title} — ${doc.subtitle}`} author="Caixinha dos Amigos" language="pt-BR">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.brand}>CAIXINHA DOS AMIGOS</Text>
          <Text style={s.headerRight}>{pdfText(`${doc.title} · ${doc.subtitle}`)}</Text>
        </View>

        <Text style={s.title}>{pdfText(doc.title)}</Text>
        <Text style={s.subtitle}>{pdfText(`${doc.subtitle} · gerado em ${doc.generatedAt}`)}</Text>
        {doc.stamp && <Text style={s.stamp}>{pdfText(doc.stamp)}</Text>}

        {doc.summary.length > 0 && (
          <View style={s.summary}>
            {doc.summary.map((item) => (
              <View key={item.label} style={s.summaryItem}>
                <Text style={s.summaryLabel}>{pdfText(item.label)}</Text>
                <Text style={s.summaryValue}>{pdfText(formatCell(item.value, item.kind))}</Text>
              </View>
            ))}
          </View>
        )}

        {doc.sections.map((section) => (
          <Table key={section.title} section={section} />
        ))}

        {doc.notes.length > 0 && (
          <View style={s.notes} wrap={false}>
            {doc.notes.map((n) => (
              <Text key={n} style={s.note}>
                • {pdfText(n)}
              </Text>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>Caixinha dos Amigos · grupo privado · documento gerado eletronicamente</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
