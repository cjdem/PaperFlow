"""
样式与主题管理模块
"""
import streamlit as st

# ================= 主题配置 =================
THEMES = {
    "light": {
        "bg_app": "#f8f9fa", "bg_sidebar": "#ffffff", "text_main": "#111827", "text_sub": "#4b5563",
        "text_meta": "#6b7280", "card_bg": "#ffffff", "card_border": "#e5e7eb", "action_bg": "#f9fafb",
        "highlight": "#2563eb", "tag_bg": "#eff6ff", "tag_text": "#1d4ed8", "input_bg": "#ffffff",
        "input_border": "#e2e8f0", "input_text": "#111827", "code_bg": "#f3f4f6", "pre_bg": "#f8fafc",
        "popover_bg": "#ffffff", "placeholder_text": "#4b5563",
    },
    "dark": {
        "bg_app": "#0d1117", "bg_sidebar": "#161b22", "text_main": "#f0f6fc", "text_sub": "#c9d1d9",
        "text_meta": "#8b949e", "card_bg": "#1f2937", "card_border": "#30363d", "action_bg": "#161b22",
        "highlight": "#58a6ff", "tag_bg": "#1f2937", "tag_text": "#a5d6ff", "input_bg": "#0d1117",
        "input_border": "#30363d", "input_text": "#f0f6fc", "code_bg": "#2d333b", "pre_bg": "#161b22",
        "popover_bg": "#1f2937", "placeholder_text": "#8b949e",
    },
}


def apply_theme():
    """应用当前主题并返回颜色配置"""
    if "theme_mode" not in st.session_state:
        st.session_state.theme_mode = "light"
    if "theme" not in st.query_params:
        st.query_params["theme"] = "light"
    if st.session_state.theme_mode != st.query_params["theme"]:
        st.session_state.theme_mode = st.query_params["theme"]
    
    C = THEMES[st.session_state.theme_mode]
    st.markdown(
        f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    /* 全局样式 */
    html, body, [class*="css"] {{ font-family: 'Inter', system-ui, sans-serif; }}
    .stApp {{ background-color: {C['bg_app']} !important; color: {C['text_main']} !important; }}
    
    /* 顶部 Header */
    header[data-testid="stHeader"] {{ 
        background-color: {C['bg_app']} !important; 
    }}
    
    /* 侧边栏 */
    [data-testid="stSidebar"] {{ 
        background-color: {C['bg_sidebar']} !important; 
        border-right: 1px solid {C['card_border']} !important; 
    }}
    [data-testid="stSidebar"] * {{ color: {C['text_main']} !important; }}
    
    /* 输入框 */
    div[data-testid="stTextInput"] input {{ 
        background-color: {C['input_bg']} !important; 
        color: {C['input_text']} !important; 
        border-color: {C['input_border']} !important; 
    }}
    div[data-testid="stTextInput"] input::placeholder {{ 
        color: {C['placeholder_text']} !important; 
        opacity: 1 !important; 
    }}
    
    /* 展开器 */
    div[data-testid="stExpander"] {{ 
        background-color: {C['card_bg']} !important; 
        border: 1px solid {C['card_border']} !important; 
        border-radius: 8px; 
    }}
    div[data-testid="stExpander"] details {{ 
        background-color: {C['card_bg']} !important; 
    }}
    div[data-testid="stExpander"] summary {{ 
        background-color: {C['card_bg']} !important; 
        color: {C['text_main']} !important; 
    }}
    div[data-testid="stExpander"] [data-testid="stExpanderDetails"] {{ 
        background-color: {C['card_bg']} !important; 
    }}
    
    /* 按钮 */
    .stButton button {{ 
        background-color: {C['action_bg']} !important; 
        color: {C['text_main']} !important; 
        border: 1px solid {C['card_border']} !important; 
    }}
    .stButton button:hover {{ 
        background-color: {C['card_bg']} !important; 
        border-color: {C['highlight']} !important; 
    }}
    
    /* 主按钮 */
    .stButton button[kind="primary"] {{ 
        background-color: {C['highlight']} !important; 
        color: white !important; 
        border: none !important; 
    }}
    
    /* 多选框 */
    div[data-baseweb="select"] {{ 
        background-color: {C['input_bg']} !important; 
    }}
    div[data-baseweb="select"] > div {{ 
        background-color: {C['input_bg']} !important; 
        color: {C['text_main']} !important; 
        border-color: {C['input_border']} !important; 
    }}
    /* ================================================================= */
    /* 🔴 强制修复：多选框文字颜色 */
    /* ================================================================= */
    div[data-baseweb="select"] * {{
        color: {C['text_main']} !important;
        -webkit-text-fill-color: {C['text_main']} !important; /* 强制覆盖 */
    }}
    div[data-baseweb="select"] input::placeholder {{
        color: {C['text_main']} !important;
        opacity: 1 !important;
        -webkit-text-fill-color: {C['text_main']} !important;
    }}
    /* 针对模拟的占位符 div/span */
    div[data-baseweb="select"] div[class*="Placeholder"],
    div[data-baseweb="select"] span[class*="Placeholder"] {{
        color: {C['text_main']} !important;
        opacity: 1 !important;
    }}

    /* ================================================================= */
    /* 🔴 强制修复：新建分组(Popover)文字颜色 */
    /* ================================================================= */
    div[data-testid="stPopover"] * {{
        color: {C['text_main']} !important;
    }}
    div[data-testid="stPopover"] input::placeholder {{
        color: {C['text_main']} !important; 
        opacity: 0.7 !important; /* 稍微透明一点区分内容 */
        -webkit-text-fill-color: {C['text_main']} !important;
    }}
    /* 多选框下拉菜单 - 更强力的选择器 */
    div[data-baseweb="popover"] {{ 
        background-color: {C['popover_bg']} !important; 
    }}
    div[data-baseweb="popover"] > div {{ 
        background-color: {C['popover_bg']} !important; 
    }}
    div[data-baseweb="popover"] ul {{ 
        background-color: {C['popover_bg']} !important; 
    }}
    ul[role="listbox"] {{ 
        background-color: {C['popover_bg']} !important; 
    }}
    ul[role="listbox"] li {{ 
        background-color: {C['popover_bg']} !important; 
        color: {C['text_main']} !important; 
    }}
    ul[role="listbox"] li:hover {{ 
        background-color: {C['card_bg']} !important; 
    }}
    /* No results 提示 - 更强力的选择器 */
    div[data-baseweb="menu"] {{ 
        background-color: {C['popover_bg']} !important; 
        color: {C['text_meta']} !important; 
    }}
    div[data-baseweb="menu"] > ul {{ 
        background-color: {C['popover_bg']} !important; 
    }}
    div[data-baseweb="menu"] li {{ 
        background-color: {C['popover_bg']} !important; 
        color: {C['text_meta']} !important; 
    }}
    /* 下拉选项 */
    [role="option"] {{ 
        background-color: {C['popover_bg']} !important; 
        color: {C['text_main']} !important; 
    }}
    [role="option"]:hover {{ 
        background-color: {C['card_bg']} !important; 
    }}
    
    /* 标签页 */
    .stTabs [data-baseweb="tab-list"] {{ 
        background-color: {C['card_bg']} !important; 
        border-bottom: 1px solid {C['card_border']} !important; 
    }}
    .stTabs [data-baseweb="tab"] {{ 
        background-color: transparent !important; 
        color: {C['text_sub']} !important; 
    }}
    .stTabs [aria-selected="true"] {{ 
        background-color: transparent !important; 
        color: {C['highlight']} !important; 
        border-bottom-color: {C['highlight']} !important; 
    }}
    .stTabs [data-baseweb="tab-panel"] {{ 
        background-color: {C['card_bg']} !important; 
    }}
    
    /* 文件上传器 */
    [data-testid="stFileUploader"] {{ 
        background-color: {C['card_bg']} !important; 
        border: 2px dashed {C['card_border']} !important; 
        border-radius: 8px; 
    }}
    [data-testid="stFileUploader"] section {{ 
        background-color: {C['card_bg']} !important; 
        color: {C['text_main']} !important; 
    }}
    [data-testid="stFileUploader"] small {{ 
        color: {C['text_meta']} !important; 
    }}
    [data-testid="stFileUploader"] button {{ 
        background-color: {C['action_bg']} !important; 
        color: {C['text_main']} !important; 
        border: 1px solid {C['card_border']} !important; 
    }}
    
    /* 弹出框 (Popover) - 新建分组等 */
    div[data-testid="stPopover"] {{ 
        background-color: {C['popover_bg']} !important; 
        border: 1px solid {C['card_border']} !important; 
    }}
    div[data-testid="stPopover"] > div {{ 
        background-color: {C['popover_bg']} !important; 
    }}
    /* Popover 内的所有元素 */
    div[data-testid="stPopover"] * {{ 
        color: {C['text_main']} !important; 
    }}
    /* Popover 内的按钮 */
    div[data-testid="stPopover"] button {{ 
        background-color: {C['action_bg']} !important; 
        color: {C['text_main']} !important; 
        border: 1px solid {C['card_border']} !important; 
    }}
    div[data-testid="stPopover"] button[kind="primary"] {{ 
        background-color: {C['highlight']} !important; 
        color: white !important; 
    }}
    /* Popover 内的输入框 */
    div[data-testid="stPopover"] input {{ 
        background-color: {C['input_bg']} !important; 
        color: {C['input_text']} !important; 
        border-color: {C['input_border']} !important; 
    }}
    div[data-testid="stPopover"] input::placeholder {{ 
        color: {C['text_main']} !important; 
        opacity: 0.8 !important; 
        font-weight: 500 !important;
    }}
    div[data-testid="stPopover"] label {{ 
        color: {C['text_main']} !important; 
    }}
    
    /* 输入框占位符 */
    input::placeholder {{ 
        color: {C['placeholder_text']} !important; 
    }}
    
    /* 表单 */
    .stForm {{ 
        background-color: {C['card_bg']} !important; 
        border: 1px solid {C['card_border']} !important; 
    }}
    /* 表单内的 label */
    .stForm label {{ 
        color: {C['text_main']} !important; 
    }}
    /* 表单内的所有文字 */
    .stForm p, .stForm span {{ 
        color: {C['text_main']} !important; 
    }}
    /* 密码显示/隐藏按钮 */
    button[kind="icon"] {{ 
        background-color: {C['action_bg']} !important; 
        color: {C['text_main']} !important; 
    }}
    button[kind="icon"]:hover {{ 
        background-color: {C['card_bg']} !important; 
    }}
    
    /* 代码块 */
    .stMarkdown pre {{ 
        background-color: {C['pre_bg']} !important; 
        color: {C['text_main']} !important; 
        padding: 12px !important;
        border-radius: 6px !important;
    }}
    .stMarkdown code:not(pre code) {{ 
        background-color: {C['code_bg']} !important; 
        color: {C['text_main']} !important; 
        padding: 2px 6px !important;
        border-radius: 3px !important;
    }}
    .stMarkdown p, .stMarkdown div {{ 
        background-color: transparent !important; 
    }}
    
    
    /* 容器 */
    div[data-testid="stVerticalBlock"] > div {{ 
        background-color: transparent !important; 
    }}
    
    /* Radio 单选按钮 */
    div[role="radiogroup"] {{ 
        background-color: transparent !important; 
    }}
    div[role="radiogroup"] label {{ 
        color: {C['text_main']} !important; 
    }}
    
    /* 指标卡片 */
    [data-testid="stMetric"] {{ 
        background-color: {C['card_bg']} !important; 
        border: 1px solid {C['card_border']} !important; 
        border-radius: 8px; 
        padding: 12px; 
    }}
    [data-testid="stMetricLabel"] {{ color: {C['text_sub']} !important; }}
    [data-testid="stMetricValue"] {{ color: {C['text_main']} !important; }}
    
    /* 数据表格 */
    .stDataFrame {{ 
        background-color: {C['card_bg']} !important; 
    }}
    .stDataFrame table {{ 
        background-color: {C['card_bg']} !important; 
        color: {C['text_main']} !important; 
    }}
    .stDataFrame th {{ 
        background-color: {C['action_bg']} !important; 
        color: {C['text_main']} !important; 
        border-color: {C['card_border']} !important; 
    }}
    .stDataFrame td {{ 
        background-color: {C['card_bg']} !important; 
        color: {C['text_main']} !important; 
        border-color: {C['card_border']} !important; 
    }}
    
    /* Toast 提示 */
    .stToast {{ 
        background-color: {C['card_bg']} !important; 
        color: {C['text_main']} !important; 
        border: 1px solid {C['card_border']} !important; 
    }}
</style>
""",
        unsafe_allow_html=True,
    )
    return C


def toggle_theme():
    """切换明暗主题"""
    new = "dark" if st.session_state.theme_mode == "light" else "light"
    st.session_state.theme_mode = new
    st.query_params["theme"] = new
