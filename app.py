"""
PaperFlow Pro - 主入口
重构后的简洁入口文件，负责应用初始化和流程控制
"""
import streamlit as st

from styles import apply_theme
from ui_components import render_login_page, render_sidebar, render_admin_panel, render_paper_list

# ================= 核心配置 =================
st.set_page_config(
    page_title="PaperFlow Pro",
    page_icon="🧬",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ================= 主程序入口 =================
if __name__ == "__main__":
    # 初始化会话状态
    if "logged_in" not in st.session_state:
        st.session_state.logged_in = False
        st.session_state.user = None

    # 应用主题
    C = apply_theme()

    # 应用流程控制
    if not st.session_state.logged_in:
        render_login_page()
    else:
        user = st.session_state.user
        view, groups = render_sidebar(user)

        if view == "admin_panel":
            render_admin_panel()
        else:
            render_paper_list(view, groups, user, C)
