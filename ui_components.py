"""
UI组件模块 - 所有Streamlit渲染函数
"""
import streamlit as st
import pandas as pd
import asyncio
import os
import time

from styles import toggle_theme
from utils import calculate_md5, clean_markdown_math
from db_service import (
    get_all_groups_list, get_papers, create_group,
    update_paper_groups, is_md5_exist, get_db_stats, get_all_users
)
from auth_service import verify_user, register_user
from main import process_workflow


# ================= 登录页面 =================
def render_login_page():
    """渲染登录/注册页面"""
    if "auth_mode" not in st.session_state:
        st.session_state.auth_mode = "login"

    c1, c2, c3 = st.columns([1, 1.2, 1])

    with c2:
        st.markdown("<br><br>", unsafe_allow_html=True)
        st.markdown("<h1 style='text-align: center; margin-bottom: 30px;'>🧬 PaperFlow Pro</h1>", unsafe_allow_html=True)

        with st.container(border=True):
            if st.session_state.auth_mode == "login":
                st.subheader("欢迎回来")
                with st.form("login_form"):
                    username = st.text_input("用户名")
                    password = st.text_input("密码", type="password")
                    submitted = st.form_submit_button("立即登录", use_container_width=True, type="primary")
                    if submitted:
                        user = verify_user(username, password)
                        if user:
                            st.session_state.logged_in = True
                            st.session_state.user = user
                            st.rerun()
                        else:
                            st.error("❌ 用户名或密码错误")

                st.markdown("---")
                col_switch_1, col_switch_2 = st.columns([1, 1])
                with col_switch_1:
                    st.caption("还没有账号？")
                with col_switch_2:
                    if st.button("✨ 注册新账户", use_container_width=True):
                        st.session_state.auth_mode = "register"
                        st.rerun()

            else:
                st.subheader("创建新账户")
                with st.form("register_form"):
                    new_user = st.text_input("设置用户名")
                    new_pass = st.text_input("设置密码", type="password")
                    email = st.text_input("邮箱 (可选)")
                    reg_submitted = st.form_submit_button("确认注册", use_container_width=True, type="primary")

                    if reg_submitted:
                        success, msg = register_user(new_user, new_pass, email)
                        if success:
                            st.success(f"✅ {msg}")
                            time.sleep(1)
                            st.session_state.auth_mode = "login"
                            st.rerun()
                        else:
                            st.error(f"❌ {msg}")

                st.markdown("---")
                col_switch_1, col_switch_2 = st.columns([1, 1])
                with col_switch_1:
                    st.caption("已经有账号了？")
                with col_switch_2:
                    if st.button("⬅️ 返回登录", use_container_width=True):
                        st.session_state.auth_mode = "login"
                        st.rerun()


# ================= 侧边栏 =================
def render_sidebar(user_info: dict) -> tuple[str, list[str]]:
    """渲染侧边栏，返回当前视图和分组列表"""
    with st.sidebar:
        st.title("🧬 PaperFlow")
        st.caption(f"👤 {user_info['username']}")
        if user_info['role'] == 'admin':
            st.info("🛡️ 管理员权限已激活")

        c1, c2 = st.columns(2)
        with c1:
            if st.button("退出登录", use_container_width=True):
                st.session_state.logged_in = False
                st.session_state.user = None
                st.rerun()
        with c2:
            st.button("🌓 换肤", on_click=toggle_theme, use_container_width=True)

        st.markdown("---")

        all_groups = get_all_groups_list()
        nav_options = ["📚 我的论文", "📂 未分类"] + [f"🏷️ {g}" for g in all_groups]

        if user_info['role'] == 'admin':
            nav_options.insert(0, "🔧 系统管理")

        select = st.radio("视图导航", nav_options, label_visibility="collapsed")

        if "我的论文" in select:
            current_view = "all"
        elif "未分类" in select:
            current_view = "ungrouped"
        elif "系统管理" in select:
            current_view = "admin_panel"
        else:
            current_view = select.replace("🏷️ ", "")

        if current_view != "admin_panel":
            st.markdown("### 快速操作")
            with st.popover("➕ 新建分组", use_container_width=True):
                new_g = st.text_input("分组名称")
                if st.button("确认创建", type="primary", use_container_width=True):
                    if create_group(new_g):
                        st.rerun()

            with st.expander("📤 上传新论文", expanded=True):
                files = st.file_uploader("拖拽PDF到此处", type="pdf", accept_multiple_files=True, label_visibility="collapsed")
                if files:
                    if st.button(f"处理 {len(files)} 个文件", type="primary", use_container_width=True):
                        handle_file_upload(files, user_info['id'])

        return current_view, all_groups


# ================= 文件上传处理 =================
def handle_file_upload(uploaded_files, owner_id: int):
    """处理文件上传"""
    prog = st.progress(0)
    if not os.path.exists("temp"):
        os.makedirs("temp", exist_ok=True)

    try:
        for i, f in enumerate(uploaded_files):
            f.seek(0)
            md5 = calculate_md5(f.read())
            f.seek(0)

            if is_md5_exist(md5):
                st.toast(f"已存在: {f.name}")
            else:
                tpath = f"temp/{f.name}"
                with open(tpath, "wb") as tmp:
                    tmp.write(f.read())

                asyncio.run(process_workflow(tpath, md5, owner_id))

                if os.path.exists(tpath):
                    os.remove(tpath)
                st.toast(f"✅ 完成: {f.name}")
            prog.progress((i + 1) / len(uploaded_files))
    finally:
        time.sleep(1)
        st.rerun()


# ================= 管理员面板 =================
def render_admin_panel():
    """渲染管理员控制面板"""
    from llm_service import (
        get_all_providers, add_provider, update_provider, 
        delete_provider, set_primary, toggle_enabled
    )
    from llm_pool import llm_manager
    
    st.title("🔧 系统管理控制台")
    
    # 创建标签页
    tab1, tab2 = st.tabs(["📊 系统概览", "🤖 LLM 配置"])
    
    # ========== Tab 1: 系统概览 ==========
    with tab1:
        stats = get_db_stats()
        c1, c2, c3 = st.columns(3)
        c1.metric("总注册用户", stats["user_count"])
        c2.metric("总收录论文", stats["paper_count"])
        c3.metric("总分组标签", stats["group_count"])

        st.subheader("用户数据库")
        users = get_all_users()
        if users:
            df = pd.DataFrame(users)
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("暂无用户数据")
    
    # ========== Tab 2: LLM 配置 ==========
    with tab2:
        st.subheader("LLM 提供商管理")
        
        # 刷新按钮
        col_refresh, col_add = st.columns([1, 1])
        with col_refresh:
            if st.button("🔄 刷新配置", use_container_width=True):
                llm_manager.reload_config()
                st.success("配置已刷新！")
                st.rerun()
        
        with col_add:
            with st.popover("➕ 添加提供商", use_container_width=True):
                with st.form("add_provider_form"):
                    new_name = st.text_input("名称", placeholder="例如: OpenAI 主力")
                    new_url = st.text_input("API 地址", placeholder="https://api.openai.com/v1")
                    new_key = st.text_input("API 密钥", type="password")
                    new_pool = st.selectbox("池类型", ["metadata", "analysis"])
                    new_models = st.text_input("模型列表", placeholder="gpt-4,gpt-3.5-turbo")
                    new_primary = st.checkbox("设为主模型")
                    new_priority = st.number_input("优先级", min_value=1, max_value=999, value=100)
                    
                    if st.form_submit_button("添加", type="primary", use_container_width=True):
                        if new_name and new_url and new_key and new_models:
                            add_provider(new_name, new_url, new_key, new_pool, new_models, new_primary, new_priority)
                            llm_manager.reload_config()
                            st.success("添加成功！")
                            st.rerun()
                        else:
                            st.error("请填写所有必填字段")
        
        st.markdown("---")
        
        # 显示两个池子的配置
        for pool_type, pool_label in [("metadata", "📑 Metadata 池"), ("analysis", "📊 Analysis 池")]:
            st.markdown(f"### {pool_label}")
            providers = get_all_providers(pool_type)
            
            if not providers:
                st.info(f"暂无 {pool_type} 提供商，请添加")
                continue
            
            for p in providers:
                # 使用 expander 展开详情
                primary_badge = "⭐ " if p["is_primary"] else ""
                status_icon = "✅" if p["enabled"] else "⏸️"
                expander_title = f"{status_icon} {primary_badge}{p['name']} (优先级: {p['priority']})"
                
                with st.expander(expander_title, expanded=False):
                    # 操作按钮行 - 3列等宽
                    btn_cols = st.columns(3)
                    
                    with btn_cols[0]:
                        if not p["is_primary"]:
                            if st.button("⭐ 设为主力", key=f"primary_{p['id']}", use_container_width=True):
                                set_primary(p["id"])
                                llm_manager.reload_config()
                                st.rerun()
                        else:
                            st.button("⭐ 主力模型", key=f"primary_show_{p['id']}", use_container_width=True, disabled=True)
                    
                    with btn_cols[1]:
                        toggle_label = "⏸️ 禁用" if p["enabled"] else "▶️ 启用"
                        if st.button(toggle_label, key=f"toggle_{p['id']}", use_container_width=True):
                            toggle_enabled(p["id"])
                            llm_manager.reload_config()
                            st.rerun()
                    
                    with btn_cols[2]:
                        if st.button("🗑️ 删除", key=f"del_{p['id']}", use_container_width=True):
                            delete_provider(p["id"])
                            llm_manager.reload_config()
                            st.rerun()
                    
                    # 编辑表单
                    with st.form(f"edit_form_{p['id']}"):
                        # API 密钥 - 多行输入
                        st.markdown("**API 密钥**")
                        # 将逗号分隔转换为换行显示
                        keys_multiline = p["api_key"].replace(",", "\n")
                        edit_key = st.text_area(
                            "API 密钥", 
                            value=keys_multiline, 
                            height=80,
                            label_visibility="collapsed",
                            help="每行一个密钥"
                        )
                        st.caption("每行一个密钥")
                        
                        # API 地址
                        st.markdown("**API 地址**")
                        edit_url = st.text_input(
                            "API 地址", 
                            value=p["base_url"],
                            label_visibility="collapsed"
                        )
                        st.caption(f"预览: {p['base_url']}/chat/completions")
                        
                        # 模型列表
                        st.markdown("**模型列表**")
                        edit_models = st.text_input(
                            "模型列表", 
                            value=p["models"],
                            label_visibility="collapsed",
                            help="支持多个模型，用逗号分隔"
                        )
                        st.caption("多个模型用逗号分隔，按顺序尝试")
                        
                        # 优先级和名称
                        col_pri, col_name = st.columns(2)
                        with col_pri:
                            st.markdown("**优先级**")
                            edit_priority = st.number_input(
                                "优先级", 
                                min_value=1, 
                                max_value=999, 
                                value=p["priority"],
                                label_visibility="collapsed",
                                help="数字越小优先级越高"
                            )
                        with col_name:
                            st.markdown("**名称**")
                            edit_name = st.text_input(
                                "名称", 
                                value=p["name"],
                                label_visibility="collapsed"
                            )
                        
                        # 保存按钮
                        if st.form_submit_button("💾 保存修改", type="primary", use_container_width=True):
                            # 将多行密钥转换为逗号分隔
                            api_key_cleaned = ",".join([k.strip() for k in edit_key.strip().split("\n") if k.strip()])
                            update_provider(
                                p["id"], 
                                name=edit_name, 
                                base_url=edit_url,
                                api_key=api_key_cleaned,
                                models=edit_models, 
                                priority=edit_priority
                            )
                            llm_manager.reload_config()
                            st.success("✅ 保存成功！")
                            st.rerun()


# ================= 论文列表 =================
def render_paper_list(current_view: str, all_group_options: list[str], user_info: dict, C: dict):
    """渲染论文列表"""
    st.header(current_view if current_view != "all" else "我的论文库")

    col_search, _ = st.columns([1, 2])
    with col_search:
        search_q = st.text_input("🔍 搜索", placeholder="标题、作者、关键词...", label_visibility="collapsed")

    st.markdown("---")

    papers = get_papers(user_info, current_view, search_q)

    if not papers:
        st.markdown(
            f"<div style='text-align:center; padding: 40px; color:{C['text_meta']}'>📭 还没有相关论文<br>请点击左侧栏上传 PDF</div>",
            unsafe_allow_html=True
        )
        return

    for paper in papers:
        admin_badge = ""
        if user_info['role'] == 'admin' and paper.owner:
            admin_badge = f" <span style='background:#fef2f2; color:#ef4444; border:1px solid #fecaca; padding:2px 6px; border-radius:4px; font-size:0.7em'>👤 {paper.owner.username}</span>"

        st.markdown(
            f"""
        <div style="border:1px solid {C['card_border']}; padding:16px; border-radius:10px; background:{C['card_bg']}; margin-bottom:12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            <div style="font-size:1.15em; font-weight:600; color:{C['text_main']}; margin-bottom:4px;">{paper.title}{admin_badge}</div>
            <div style="font-size:0.9em; color:{C['text_sub']}; margin-bottom:8px;">{paper.title_cn or ''}</div>
            <div style="font-size:0.8em; color:{C['text_meta']}; display:flex; align-items:center; gap:10px;">
                <span style="background:{C['action_bg']}; padding:2px 8px; border-radius:4px;">{paper.journal or 'Journal'}</span>
                <span>📅 {paper.year}</span>
                <span style="font-style:italic;">✍️ {paper.authors[:40]}...</span>
            </div>
        </div>
        """, unsafe_allow_html=True
        )

        c_tag, c_detail = st.columns([3, 1])
        with c_tag:
            current_tags = [g.name for g in paper.groups]
            st.multiselect(
                "Tags", all_group_options, default=current_tags,
                key=f"g_{paper.id}", label_visibility="collapsed", placeholder="➕ 添加标签...",
                on_change=lambda pid=paper.id: update_paper_groups(pid, st.session_state[f"g_{pid}"])
            )

        with st.expander("📖 阅读报告", expanded=False):
            t1, t2, t3 = st.tabs(["💡 深度分析", "📄 原始摘要", "🇨🇳 中文摘要"])
            with t1:
                # 添加CSS样式减小标题字号
                st.markdown("""
                <style>
                .element-container h1 { font-size: 1.5em !important; }
                .element-container h2 { font-size: 1.3em !important; }
                .element-container h3 { font-size: 1.1em !important; }
                .element-container h4 { font-size: 1.0em !important; }
                </style>
                """, unsafe_allow_html=True)
                st.markdown(clean_markdown_math(paper.detailed_analysis))
            with t2:
                st.markdown(paper.abstract_en)
            with t3:
                st.markdown(paper.abstract or "暂无中文摘要")
