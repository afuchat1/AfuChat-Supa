module.exports = [
"[project]/artifacts/web/app/layout.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RootLayout,
    "metadata",
    ()=>metadata
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$3$2e$4_$40$babel$2b$core$40$7$2e$29$2e$7_$40$types$2b$node$40$26$2e$5$2e$0_babel$2d$plugin$2d$react$2d$compiler$40$1$2e$0$2e$0_rea_5bae037b911f328954e16c0c36ed83b9$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.3.4_@babel+core@7.29.7_@types+node@26.5.0_babel-plugin-react-compiler@1.0.0_rea_5bae037b911f328954e16c0c36ed83b9/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
;
;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://afuchat.com";
const metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: "AfuChat — Connect, create, and belong",
        template: "%s | AfuChat"
    },
    description: "AfuChat brings private messaging, communities, short videos, AfuAI, and everyday value into one social app built for Africa and the world.",
    applicationName: "AfuChat",
    keywords: [
        "AfuChat",
        "African social app",
        "private messaging",
        "online communities",
        "short videos",
        "AfuAI"
    ],
    alternates: {
        canonical: "/"
    },
    openGraph: {
        type: "website",
        url: siteUrl,
        siteName: "AfuChat",
        title: "AfuChat — Connect, create, and belong",
        description: "One place for your people, your ideas, and your everyday moments.",
        images: [
            {
                url: "/images/icon.png",
                width: 512,
                height: 512,
                alt: "AfuChat app icon"
            }
        ]
    },
    twitter: {
        card: "summary",
        title: "AfuChat — Connect, create, and belong",
        description: "Private messaging, communities, short videos, AfuAI, and more in one app.",
        images: [
            "/images/icon.png"
        ]
    },
    icons: {
        icon: "/images/icon.png",
        apple: "/images/icon.png"
    }
};
function RootLayout({ children }) {
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "AfuChat",
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Web",
        description: "AfuChat brings private messaging, communities, short videos, AfuAI, and everyday value into one social app.",
        url: siteUrl
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$3$2e$4_$40$babel$2b$core$40$7$2e$29$2e$7_$40$types$2b$node$40$26$2e$5$2e$0_babel$2d$plugin$2d$react$2d$compiler$40$1$2e$0$2e$0_rea_5bae037b911f328954e16c0c36ed83b9$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("html", {
        lang: "en",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$3$2e$4_$40$babel$2b$core$40$7$2e$29$2e$7_$40$types$2b$node$40$26$2e$5$2e$0_babel$2d$plugin$2d$react$2d$compiler$40$1$2e$0$2e$0_rea_5bae037b911f328954e16c0c36ed83b9$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("body", {
            children: [
                children,
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$3$2e$4_$40$babel$2b$core$40$7$2e$29$2e$7_$40$types$2b$node$40$26$2e$5$2e$0_babel$2d$plugin$2d$react$2d$compiler$40$1$2e$0$2e$0_rea_5bae037b911f328954e16c0c36ed83b9$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("script", {
                    type: "application/ld+json",
                    dangerouslySetInnerHTML: {
                        __html: JSON.stringify(structuredData)
                    }
                }, void 0, false, {
                    fileName: "[project]/artifacts/web/app/layout.tsx",
                    lineNumber: 58,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/artifacts/web/app/layout.tsx",
            lineNumber: 56,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/artifacts/web/app/layout.tsx",
        lineNumber: 55,
        columnNumber: 5
    }, this);
}
}),
"[project]/artifacts/web/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", (function(__turbopack_context__){

__turbopack_context__.n(__turbopack_context__.i("[project]/artifacts/web/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/node_modules/.pnpm/next@16.3.4_@babel+core@7.29.7_@types+node@26.5.0_babel-plugin-react-compiler@1.0.0_rea_5bae037b911f328954e16c0c36ed83b9/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

module.exports = __turbopack_context__.r("[project]/node_modules/.pnpm/next@16.3.4_@babel+core@7.29.7_@types+node@26.5.0_babel-plugin-react-compiler@1.0.0_rea_5bae037b911f328954e16c0c36ed83b9/node_modules/next/dist/server/route-modules/app-page/module.compiled.js [app-rsc] (ecmascript)").vendored['react-rsc'].ReactJsxDevRuntime;
}),
];

//# sourceMappingURL=_1pp2tyy._.js.map